import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canShip } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  jobId: z.string().min(1),
  photo: z.string().min(1),
  note: z.string().nullable().optional(),
});

// List recent shipments WITHOUT the photo blob (kept light); the photo is served
// on demand from /api/shipments/[id]/photo.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const shipments = await prisma.shipment.findMany({
    orderBy: { shippedAt: "desc" },
    take: 100,
    select: {
      id: true, note: true, shippedAt: true,
      job: { select: { seq: true, docNo: true, customer: true, item: true, qty: true } },
      createdBy: { select: { name: true } },
    },
  });
  return NextResponse.json(shipments);
}

// Confirm equipment delivery to the factory: for a job PRODUCTION approved (status
// รอจัดส่ง), SHIPPING records a photo + note of what arrived, releasing it to
// production (รอผลิต / PENDING). Not linked to material stock.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canShip((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  if (!d.photo.startsWith("data:image/")) {
    return NextResponse.json({ error: "ต้องแนบรูปยืนยันการมาส่ง (image)" }, { status: 400 });
  }
  if (d.photo.length > 8_000_000) {
    return NextResponse.json({ error: "รูปใหญ่เกินไป — ถ่ายใหม่หรือลดขนาด" }, { status: 413 });
  }

  const job = await prisma.job.findUnique({ where: { id: d.jobId } });
  if (!job) return NextResponse.json({ error: "ไม่พบงาน" }, { status: 404 });
  // Shipping confirms the equipment was delivered to the factory for a job that
  // PRODUCTION approved (status รอจัดส่ง). Confirming releases it to production (รอผลิต).
  if (job.status !== "AWAITING_DELIVERY") {
    return NextResponse.json(
      { error: `ยืนยันได้เฉพาะงานสถานะ "รอจัดส่ง" — งานนี้สถานะ ${job.status}` },
      { status: 400 }
    );
  }
  const already = await prisma.shipment.findUnique({ where: { jobId: d.jobId } });
  if (already) return NextResponse.json({ error: "งานนี้ยืนยันมาส่งไปแล้ว" }, { status: 409 });

  const now = new Date();
  const shipment = await prisma.shipment.create({
    data: {
      jobId: d.jobId,
      photo: d.photo,
      note: d.note?.trim() || null,
      shippedAt: now, // delivery-confirmed timestamp
      createdById: (session.user as any).id,
    },
  });
  // รอจัดส่ง → รอผลิต. Stock/ETA were already set at approval, so no requeue needed.
  await prisma.job.update({
    where: { id: d.jobId },
    data: { status: "PENDING", shippedAt: now },
  });
  await prisma.jobLog.create({
    data: { jobId: d.jobId, status: "PENDING", message: `จัดส่งยืนยันมาส่งของ: รอจัดส่ง → รอผลิต` },
  });

  return NextResponse.json({ ok: true, id: shipment.id }, { status: 201 });
}
