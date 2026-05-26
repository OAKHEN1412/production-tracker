import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lightweight count of jobs awaiting PRODUCTION approval — used for the nav badge.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const count = await prisma.job.count({
    where: { status: "WAITING_APPROVAL", cancelled: false },
  });
  return NextResponse.json({ count });
}
