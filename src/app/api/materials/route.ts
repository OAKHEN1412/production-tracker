import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canEditMaterials } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const materials = await prisma.material.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
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

  const mat = await prisma.material.create({
    data: {
      code,
      name: d.name.trim(),
      category: d.category?.trim() || "อื่นๆ",
      unit: d.unit?.trim() || "ชิ้น",
      qty: d.qty ?? 0,
      minQty: d.minQty ?? 0,
      location: d.location?.trim() || null,
      notes: d.notes?.trim() || null,
    },
  });
  return NextResponse.json(mat, { status: 201 });
}
