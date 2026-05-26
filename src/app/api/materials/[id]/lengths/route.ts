import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canEditMaterials } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLengthTracked } from "@/lib/materials";
import { z } from "zod";

const schema = z.object({
  lengths: z.array(
    z.object({
      lengthMm: z.coerce.number().nonnegative(),
      qty: z.coerce.number().int().nonnegative(),
    })
  ),
});

// Replace the whole per-length breakdown of a length-tracked material with the
// submitted list (จำนวนเส้นต่อความยาว). Material.qty is kept = Σ qty. These are
// the same buckets the recipe/approval cutting deducts from, so editing here
// directly changes what's available to cut.
export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditMaterials((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const material = await prisma.material.findUnique({ where: { id: ctx.params.id } });
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isLengthTracked(material.unit)) {
    return NextResponse.json({ error: `วัสดุนี้ไม่ใช่หน่วยเส้น/เมตร` }, { status: 400 });
  }

  // Merge duplicate lengths, drop empty rows. lengthMm 0 = "ไม่ระบุ".
  const byLen = new Map<number, number>();
  for (const r of parsed.data.lengths) {
    const len = r.lengthMm > 0 ? r.lengthMm : 0;
    if (r.qty > 0) byLen.set(len, (byLen.get(len) ?? 0) + r.qty);
  }
  const total = [...byLen.values()].reduce((s, q) => s + q, 0);
  const data = [...byLen].map(([lengthMm, qty]) => ({ materialId: ctx.params.id, lengthMm, qty }));

  await prisma.$transaction([
    prisma.materialLength.deleteMany({ where: { materialId: ctx.params.id } }),
    ...(data.length ? [prisma.materialLength.createMany({ data })] : []),
    prisma.material.update({ where: { id: ctx.params.id }, data: { qty: total } }),
  ]);

  return NextResponse.json({ ok: true, qty: total });
}
