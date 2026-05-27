import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

// Self-service profile edit — the logged-in user edits ONLY their own record.
// (Admin edits of any user stay in /api/users/[id], OWNER-only.)
const schema = z.object({
  name: z.string().min(1).optional(),
  username: z.string().min(3).optional(), // login id (email-style for some users)
  password: z.string().min(6).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: { id: true, name: true, username: true, role: true },
  });
  if (!me) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(me);
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const meId = (session.user as any).id;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const existing = await prisma.user.findUnique({ where: { id: meId } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const username = d.username?.trim();
  if (username && username !== existing.username) {
    const dup = await prisma.user.findUnique({ where: { username } });
    if (dup) return NextResponse.json({ error: `username "${username}" ถูกใช้แล้ว` }, { status: 409 });
  }

  const data: any = {};
  if (d.name !== undefined) data.name = d.name.trim();
  if (username !== undefined) data.username = username;
  if (d.password !== undefined) data.password = await bcrypt.hash(d.password, 10);

  const user = await prisma.user.update({
    where: { id: meId },
    data,
    select: { id: true, name: true, username: true, role: true },
  });
  // Note: the JWT keeps the old username/name until next sign-in (display-only); the
  // session is keyed by id, so the change takes full effect on next login.
  return NextResponse.json(user);
}
