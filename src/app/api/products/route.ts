import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canFullEdit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setProductMaterials, setProductAssemblies } from "@/lib/stock";
import { z } from "zod";

const assembliesSchema = z
  .array(z.object({ name: z.string(), qty: z.coerce.number().int().nonnegative() }))
  .optional();

const createSchema = z.object({
  code: z.string().nullable().optional(),
  name: z.string().min(1),
  notes: z.string().nullable().optional(),
  cutAllowanceMm: z.coerce.number().nonnegative().optional(),
  materials: z
    .array(z.object({
      materialId: z.string(),
      qtyPerUnit: z.coerce.number().nonnegative(),
      cutLengthMm: z.coerce.number().nonnegative().optional(),
    }))
    .optional(),
  assemblies: assembliesSchema,
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      materials: { include: { material: { select: { id: true, name: true, unit: true, code: true } } } },
      assemblies: true,
    },
  });
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canFullEdit((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const name = d.name.trim();
  const code = d.code?.trim() || null;

  const dupName = await prisma.product.findUnique({ where: { name } });
  if (dupName) return NextResponse.json({ error: `รุ่น "${name}" ซ้ำ — มีอยู่แล้ว` }, { status: 409 });
  if (code) {
    const dupCode = await prisma.product.findUnique({ where: { code } });
    if (dupCode) return NextResponse.json({ error: `รหัส "${code}" ซ้ำ` }, { status: 409 });
  }

  const product = await prisma.product.create({
    data: { name, code, notes: d.notes?.trim() || null, cutAllowanceMm: d.cutAllowanceMm ?? 0 },
  });
  if (d.materials) await setProductMaterials(product.id, d.materials);
  if (d.assemblies) await setProductAssemblies(product.id, d.assemblies);

  const fresh = await prisma.product.findUnique({
    where: { id: product.id },
    include: { materials: { include: { material: { select: { id: true, name: true, unit: true, code: true } } } }, assemblies: true },
  });
  return NextResponse.json(fresh, { status: 201 });
}
