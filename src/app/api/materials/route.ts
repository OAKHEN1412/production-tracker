import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canEditMaterials } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLengthTracked } from "@/lib/materials";
import { addPieces } from "@/lib/stock";
import { z } from "zod";

const createSchema = z.object({
  code: z.string().nullable().optional(),
  name: z.string().min(1),
  category: z.string().optional(),
  unit: z.string().optional(),
  qty: z.coerce.number().optional(),
  minQty: z.coerce.number().optional(),
  location: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lengthMm: z.coerce.number().nonnegative().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const materials = await prisma.material.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { lengths: { orderBy: { lengthMm: "desc" } } },
  });
  return NextResponse.json(materials);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditMaterials((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const code = d.code?.trim() || null;

  if (code) {
    const dup = await prisma.material.findUnique({ where: { code } });
    if (dup) {
      return NextResponse.json({ error: `รหัส "${code}" ซ้ำ — มีอยู่แล้ว` }, { status: 409 });
    }
  }

  const unit = d.unit?.trim() || "ชิ้น";
  const openingQty = d.qty ?? 0;
  const lengthTracked = isLengthTracked(unit);
  // Length-tracked materials with an opening balance must state the เส้น length.
  if (lengthTracked && openingQty > 0 && !((d.lengthMm ?? 0) > 0)) {
    return NextResponse.json(
      { error: `ต้องระบุความยาวต่อเส้น (mm) สำหรับหน่วย "${unit}"` },
      { status: 400 }
    );
  }

  const mat = await prisma.material.create({
    data: {
      code,
      name: d.name.trim(),
      category: d.category?.trim() || "อื่นๆ",
      unit,
      // For length-tracked, qty comes from the opening length bucket below.
      qty: lengthTracked ? 0 : openingQty,
      minQty: d.minQty ?? 0,
      location: d.location?.trim() || null,
      notes: d.notes?.trim() || null,
    },
  });
  if (lengthTracked && openingQty > 0) {
    await addPieces(mat.id, d.lengthMm ?? 0, openingQty);
  }
  return NextResponse.json(mat, { status: 201 });
}
