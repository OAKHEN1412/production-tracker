import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canEditMaterials } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLengthTracked } from "@/lib/materials";
import { addPieces, removePiecesAtLength } from "@/lib/stock";
import { z } from "zod";

const updateSchema = z.object({
  code: z.string().nullable().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().optional(),
  qty: z.coerce.number().optional(),
  minQty: z.coerce.number().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Relative stock adjustment (e.g. +10 received, -3 used). Applied on top of current qty.
  adjustDelta: z.coerce.number().optional(),
  // Length (mm) the adjustment applies to, for length-tracked materials.
  adjustLengthMm: z.coerce.number().nonnegative().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditMaterials((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const existing = await prisma.material.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const code = d.code === undefined ? undefined : d.code?.trim() || null;
  if (code && code !== existing.code) {
    const dup = await prisma.material.findUnique({ where: { code } });
    if (dup) return NextResponse.json({ error: `รหัส "${code}" ซ้ำ` }, { status: 409 });
  }

  const unit = d.unit?.trim() ?? existing.unit;
  const lengthTracked = isLengthTracked(unit);
  const wasLengthTracked = isLengthTracked(existing.unit);

  // For length-tracked materials, stock moves go through the length breakdown
  // (addPieces / removePiecesAtLength keep Material.qty in sync) — never set an
  // absolute qty here. A stock adjustment must name the length it applies to.
  let adjustWarning: string | undefined;
  if (lengthTracked && d.adjustDelta !== undefined && d.adjustDelta !== 0) {
    if (!((d.adjustLengthMm ?? 0) > 0)) {
      return NextResponse.json(
        { error: `ต้องระบุความยาว (mm) ของเส้นที่จะปรับ` },
        { status: 400 }
      );
    }
    if (d.adjustDelta > 0) {
      await addPieces(ctx.params.id, d.adjustLengthMm!, d.adjustDelta);
    } else {
      // removePiecesAtLength clamps to what the named length bucket actually holds.
      // Surface a warning when fewer pieces were removed than requested, so the UI
      // doesn't silently report success for a partial/no-op เบิก.
      const requested = -d.adjustDelta;
      const removed = await removePiecesAtLength(ctx.params.id, d.adjustLengthMm!, requested);
      if (removed < requested) {
        adjustWarning = `เบิกได้ ${removed}/${requested} เส้น ที่ความยาว ${d.adjustLengthMm} mm (สต๊อกความยาวนี้ไม่พอ)`;
      }
    }
  }

  const mat = await prisma.material.update({
    where: { id: ctx.params.id },
    data: {
      code,
      name: d.name?.trim() || undefined,
      category: d.category?.trim() ?? undefined,
      unit: d.unit?.trim() ?? undefined,
      // Count-only path: adjustDelta wins over absolute qty. Length-tracked qty is
      // managed above via the breakdown, so don't touch qty here for those.
      qty: lengthTracked
        ? undefined
        : d.adjustDelta !== undefined
          ? { increment: d.adjustDelta }
          : d.qty ?? undefined,
      minQty: d.minQty ?? undefined,
      location: d.location === undefined ? undefined : d.location?.trim() || null,
      notes: d.notes === undefined ? undefined : d.notes?.trim() || null,
    },
  });

  // Unit crossed the count↔length boundary: rebuild the length breakdown so the
  // invariant (Material.qty == Σ MaterialLength.qty) holds. Without this, a
  // count→length switch leaves qty>0 with zero buckets — recipe/approval cuts then
  // fail (InsufficientStockError) even though stock shows N.
  if (wasLengthTracked !== lengthTracked) {
    if (lengthTracked) {
      // count → length: seed one "unknown length" (lengthMm=0) bucket = current qty.
      // 0-length pieces aren't cuttable — the user assigns real lengths via 📏 ความยาว.
      await prisma.$transaction([
        prisma.materialLength.deleteMany({ where: { materialId: ctx.params.id } }),
        ...(mat.qty > 0
          ? [prisma.materialLength.create({ data: { materialId: ctx.params.id, lengthMm: 0, qty: mat.qty } })]
          : []),
      ]);
    } else {
      // length → count: drop the per-length breakdown (qty already equals Σ buckets).
      await prisma.materialLength.deleteMany({ where: { materialId: ctx.params.id } });
    }
  }

  return NextResponse.json(adjustWarning ? { ...mat, _warning: adjustWarning } : mat);
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditMaterials((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [usedInJobs, usedInProducts] = await Promise.all([
    prisma.jobMaterial.count({ where: { materialId: ctx.params.id } }),
    prisma.productMaterial.count({ where: { materialId: ctx.params.id } }),
  ]);
  if (usedInJobs > 0 || usedInProducts > 0) {
    const parts = [];
    if (usedInJobs > 0) parts.push(`${usedInJobs} งาน`);
    if (usedInProducts > 0) parts.push(`${usedInProducts} รุ่นกระบอก`);
    return NextResponse.json(
      { error: `วัสดุนี้ถูกใช้ใน ${parts.join(" และ ")} — ลบไม่ได้ (เอาออกก่อน)` },
      { status: 409 }
    );
  }

  await prisma.material.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
}
