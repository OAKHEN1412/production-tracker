import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canFullEdit } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SETTING_ID } from "@/lib/settings";
import { z } from "zod";

const schema = z.object({
  cutAllowanceMm: z.coerce.number().nonnegative(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await prisma.setting.findUnique({ where: { id: SETTING_ID } });
  return NextResponse.json({ cutAllowanceMm: s?.cutAllowanceMm ?? 0 });
}

// Master settings — OWNER/PRODUCTION only.
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canFullEdit((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const s = await prisma.setting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID, cutAllowanceMm: parsed.data.cutAllowanceMm },
    update: { cutAllowanceMm: parsed.data.cutAllowanceMm },
  });
  return NextResponse.json({ cutAllowanceMm: s.cutAllowanceMm });
}
