import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const rowSchema = z.object({
  docNo: z.string().min(1),
  orderDate: z.string(),
  deliveryTime: z.string().min(1),
  customer: z.string().min(1),
  item: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  status: z.string().optional(),
  assignedToName: z.string().optional().nullable(),
  etaManual: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "PRODUCTION" && role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!Array.isArray(body?.rows)) {
    return NextResponse.json({ error: "rows[] required" }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    where: { role: "PRODUCTION" },
    select: { id: true, name: true },
  });
  const userByName = new Map(users.map((u) => [u.name.toLowerCase(), u.id]));

  const last = await prisma.job.findFirst({ orderBy: { seq: "desc" }, select: { seq: true } });
  let nextSeq = (last?.seq ?? 0) + 1;

  const created: any[] = [];
  const errors: { row: number; error: any }[] = [];

  for (let i = 0; i < body.rows.length; i++) {
    const raw = body.rows[i];
    const p = rowSchema.safeParse(raw);
    if (!p.success) {
      errors.push({ row: i + 1, error: p.error.flatten() });
      continue;
    }
    const d = p.data;
    try {
      const exists = await prisma.job.findUnique({ where: { docNo: d.docNo } });
      if (exists) {
        errors.push({ row: i + 1, error: `docNo ซ้ำ: ${d.docNo}` });
        continue;
      }
      const assignedToId = d.assignedToName
        ? userByName.get(d.assignedToName.trim().toLowerCase()) ?? null
        : null;

      const job = await prisma.job.create({
        data: {
          seq: nextSeq++,
          docNo: d.docNo,
          orderDate: new Date(d.orderDate),
          deliveryTime: d.deliveryTime,
          customer: d.customer,
          item: d.item,
          qty: d.qty,
          status: d.status ?? "PENDING",
          assignedToId,
          etaManual: d.etaManual ? new Date(d.etaManual) : null,
          createdById: (session.user as any).id,
        },
      });
      created.push(job);
    } catch (e: any) {
      errors.push({ row: i + 1, error: e?.message ?? "unknown" });
    }
  }

  return NextResponse.json({
    createdCount: created.length,
    errorCount: errors.length,
    errors,
  });
}
