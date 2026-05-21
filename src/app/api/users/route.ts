import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(["OWNER", "PRODUCTION", "SALES"]),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (session.user as any).role;

  // OWNER: list everyone. Others: only PRODUCTION (for assignee dropdown)
  if (role === "OWNER") {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, name: true, role: true, createdAt: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(users);
  }

  const users = await prisma.user.findMany({
    where: { role: "PRODUCTION" },
    select: { id: true, name: true, username: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const p = createSchema.safeParse(body);
  if (!p.success) {
    return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  }
  const exists = await prisma.user.findUnique({ where: { username: p.data.username } });
  if (exists) {
    return NextResponse.json({ error: "username ซ้ำ" }, { status: 409 });
  }
  const user = await prisma.user.create({
    data: {
      username: p.data.username,
      password: await bcrypt.hash(p.data.password, 10),
      name: p.data.name,
      role: p.data.role,
    },
    select: { id: true, username: true, name: true, role: true },
  });
  return NextResponse.json(user, { status: 201 });
}
