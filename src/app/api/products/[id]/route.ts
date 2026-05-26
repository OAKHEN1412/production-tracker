import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canFullEdit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { setProductMaterials } from "@/lib/stock";
import { z } from "zod";

const updateSchema = z.object({
  code: z.string().nullable().optional(),
  name: z.string().optional(),
  notes: z.string().nullable().optional(),
  materials: z
    .array(z.object({
      materialId: z.string(),
      qtyPerUnit: z.coerce.number().nonnegative(),
      cutLengthMm: z.coerce.number().nonnegative().optional(),
    }))
    .optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canFullEdit((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const existing = await prisma.product.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const name = d.name?.trim();
  const code = d.code === undefined ? undefined : d.code?.trim() || null;

  if (name && name !== existing.name) {
    const dup = await prisma.product.findUnique({ where: { name } });
    if (dup) return NextResponse.json({ error: `รุ่น "${name}" ซ้ำ` }, { status: 409 });
  }
  if (code && code !== existing.code) {
    const dup = await prisma.product.findUnique({ where: { code } });
    if (dup) return NextResponse.json({ error: `รหัส "${code}" ซ้ำ` }, { status: 409 });
  }

  await prisma.product.update({
    where: { id: ctx.params.id },
    data: {
      name: name || undefined,
      code,
      notes: d.notes === undefined ? undefined : d.notes?.trim() || null,
    },
  });
  if (d.materials !== undefined) await setProductMaterials(ctx.params.id, d.materials);

  const fresh = await prisma.product.findUnique({
    where: { id: ctx.params.id },
    include: { materials: { include: { material: { select: { id: true, name: true, unit: true, code: true } } } } },
  });
  return NextResponse.json(fresh);
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canFullEdit((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // ProductMaterial rows cascade-delete with the product. Jobs are unaffected
  // (a job only copies the recipe at creation; there is no FK back to Product).
  await prisma.product.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
}
