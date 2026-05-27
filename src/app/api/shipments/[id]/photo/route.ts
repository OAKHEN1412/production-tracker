import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Serve a shipment's confirmation photo as a real image response so the list can
// lazy-load thumbnails without shipping base64 blobs in JSON.
export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const shipment = await prisma.shipment.findUnique({
    where: { id: ctx.params.id },
    select: { photo: true },
  });
  if (!shipment) return NextResponse.json({ error: "not found" }, { status: 404 });

  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(shipment.photo);
  if (!m) return NextResponse.json({ error: "bad image" }, { status: 422 });

  const buffer = Buffer.from(m[2], "base64");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
