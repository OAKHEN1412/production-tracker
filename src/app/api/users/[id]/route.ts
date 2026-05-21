import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["OWNER", "PRODUCTION", "SALES"]).optional(),
  password: z.string().min(6).optional(),
});

async function requireOwner() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if ((session.user as any).role !== "OWNER")
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { session };
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const r = await requireOwner();
  if ("error" in r) return r.error;

  const body = await req.json();
  const p = patchSchema.safeParse(body);
  if (!p.success) {
    return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  }

  // Prevent demoting last OWNER
  if (p.data.role && p.data.role !== "OWNER") {
    const target = await prisma.user.findUnique({ where: { id: ctx.params.id } });
    if (target?.role === "OWNER") {
      const owners = await prisma.user.count({ where: { role: "OWNER" } });
      if (owners <= 1) {
        return NextResponse.json({ error: "ห้ามลด OWNER คนสุดท้าย" }, { status: 400 });
      }
    }
  }

  const data: any = {};
  if (p.data.name !== undefined) data.name = p.data.name;
  if (p.data.role !== undefined) data.role = p.data.role;
  if (p.data.password !== undefined) data.password = await bcrypt.hash(p.data.password, 10);

  const user = await prisma.user.update({
    where: { id: ctx.params.id },
    data,
    select: { id: true, username: true, name: true, role: true },
  });
  return NextResponse.json(user);
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const r = await requireOwner();
  if ("error" in r) return r.error;

  const target = await prisma.user.findUnique({ where: { id: ctx.params.id } });
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (target.role === "OWNER") {
    const owners = await prisma.user.count({ where: { role: "OWNER" } });
    if (owners <= 1) {
      return NextResponse.json({ error: "ห้ามลบ OWNER คนสุดท้าย" }, { status: 400 });
    }
  }
  // Unlink jobs (assignedTo) before delete
  await prisma.job.updateMany({
    where: { assignedToId: target.id },
    data: { assignedToId: null },
  });
  await prisma.user.delete({ where: { id: target.id } });
  return NextResponse.json({ ok: true });
}
