import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeWorkerQueues } from "@/lib/scheduler";
import { z } from "zod";

const createSchema = z.object({
  docNo: z.string().min(1),
  orderDate: z.string(),
  deliveryTime: z.string().optional(),
  customer: z.string().min(1),
  item: z.string().min(1),
  qty: z.coerce.number().int().positive(),
  notes: z.string().optional().nullable(),
  etaManual: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  salesOwnerId: z.string().optional().nullable(),
  status: z.string().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const jobs = await prisma.job.findMany({
    orderBy: { seq: "asc" },
    include: {
      assignedTo: { select: { id: true, name: true, username: true } },
      salesOwner: { select: { id: true, name: true, username: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "PRODUCTION" && role !== "OWNER" && role !== "SUPPORT") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  // SUPPORT cannot set status (must default PENDING) or etaManual
  const isSupport = role === "SUPPORT";

  const last = await prisma.job.findFirst({ orderBy: { seq: "desc" }, select: { seq: true } });
  const nextSeq = (last?.seq ?? 0) + 1;

  const job = await prisma.job.create({
    data: {
      seq: nextSeq,
      docNo: data.docNo,
      orderDate: new Date(data.orderDate),
      deliveryTime: data.deliveryTime || "-",
      customer: data.customer,
      item: data.item,
      qty: data.qty,
      notes: data.notes ?? null,
      etaManual: isSupport ? null : data.etaManual ? new Date(data.etaManual) : null,
      assignedToId: data.assignedToId ?? null,
      salesOwnerId: data.salesOwnerId ?? null,
      status: isSupport ? "PENDING" : data.status ?? "PENDING",
      createdById: (session.user as any).id,
    },
  });

  await prisma.jobLog.create({
    data: { jobId: job.id, status: job.status, message: "created" },
  });

  // Recompute queue ETAs for affected workers (incl. unassigned bucket)
  await recomputeWorkerQueues([data.assignedToId ?? null]);

  // Re-fetch to return fresh etaAuto + assignedTo
  const fresh = await prisma.job.findUnique({
    where: { id: job.id },
    include: {
      assignedTo: { select: { id: true, name: true, username: true } },
      salesOwner: { select: { id: true, name: true, username: true } },
    },
  });

  return NextResponse.json(fresh, { status: 201 });
}
