import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canReceiveStock } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isLengthTracked } from "@/lib/materials";
import { addPieces } from "@/lib/stock";
import { z } from "zod";

const createSchema = z.object({
  title: z.string().min(1),
  note: z.string().nullable().optional(),
  photo: z.string().min(1),
  materialId: z.string().nullable().optional(),
  qtyReceived: z.coerce.number().nonnegative().optional(),
  lengthMm: z.coerce.number().nonnegative().optional(),
});

// List recent deliveries WITHOUT the photo blob (kept light); the photo is
// served on demand from /api/deliveries/[id]/photo.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const deliveries = await prisma.delivery.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, title: true, note: true, qtyReceived: true, materialId: true, createdAt: true,
      material: { select: { name: true, unit: true } },
      createdBy: { select: { name: true } },
    },
  });
  return NextResponse.json(deliveries);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canReceiveStock((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  if (!d.photo.startsWith("data:image/")) {
    return NextResponse.json({ error: "ต้องแนบรูปยืนยัน (image)" }, { status: 400 });
  }
  if (d.photo.length > 8_000_000) {
    return NextResponse.json({ error: "รูปใหญ่เกินไป — ถ่ายใหม่หรือลดขนาด" }, { status: 413 });
  }

  const materialId = d.materialId || null;
  const qty = d.qtyReceived ?? 0;
  let mat = null;
  if (materialId) {
    mat = await prisma.material.findUnique({ where: { id: materialId } });
    if (!mat) return NextResponse.json({ error: "ไม่พบวัสดุ" }, { status: 400 });
  }

  const lengthTracked = !!mat && isLengthTracked(mat.unit);
  const lengthMm = d.lengthMm ?? 0;
  // Length-tracked materials must record the length of each เส้น received.
  if (lengthTracked && qty > 0 && !(lengthMm > 0)) {
    return NextResponse.json(
      { error: `ต้องระบุความยาวต่อเส้น (mm) สำหรับวัสดุหน่วย "${mat!.unit}"` },
      { status: 400 }
    );
  }

  const delivery = await prisma.delivery.create({
    data: {
      title: d.title.trim(),
      note: d.note?.trim() || null,
      photo: d.photo,
      materialId,
      qtyReceived: materialId ? qty : 0,
      lengthMm: lengthTracked ? lengthMm : 0,
      createdById: (session.user as any).id,
    },
  });

  // Receiving into the warehouse adds to stock.
  if (materialId && qty > 0) {
    if (lengthTracked) {
      await addPieces(materialId, lengthMm, qty);
    } else {
      await prisma.material.update({
        where: { id: materialId },
        data: { qty: { increment: qty } },
      });
    }
  }

  return NextResponse.json({ ok: true, id: delivery.id }, { status: 201 });
}
