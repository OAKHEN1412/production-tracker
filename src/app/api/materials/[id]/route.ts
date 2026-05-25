import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canCreateJob } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
});

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canCreateJob((session.user as any).role)) {
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

  const mat = await prisma.material.update({
    where: { id: ctx.params.id },
    data: {
      code,
      name: d.name?.trim() || undefined,
      category: d.category?.trim() ?? undefined,
      unit: d.unit?.trim() ?? undefined,
      // adjustDelta wins over absolute qty when present
      qty:
        d.adjustDelta !== undefined
          ? { increment: d.adjustDelta }
          : d.qty ?? undefined,
      minQty: d.minQty ?? undefined,
      location: d.location === undefined ? undefined : d.location?.trim() || null,
      notes: d.notes === undefined ? undefined : d.notes?.trim() || null,
    },
  });
  return NextResponse.json(mat);
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canCreateJob((session.user as any).role)) {
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
