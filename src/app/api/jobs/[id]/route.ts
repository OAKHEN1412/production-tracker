import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeWorkerQueues } from "@/lib/scheduler";
import { z } from "zod";

const updateSchema = z.object({
  docNo: z.string().optional(),
  orderDate: z.string().optional(),
  deliveryTime: z.string().optional(),
  customer: z.string().optional(),
  item: z.string().optional(),
  qty: z.coerce.number().int().positive().optional(),
  cancelled: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  etaManual: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  salesOwnerId: z.string().nullable().optional(),
  status: z.string().optional(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
});

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const job = await prisma.job.findUnique({
    where: { id: ctx.params.id },
    include: {
      assignedTo: { select: { id: true, name: true, username: true } },
      logs: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "PRODUCTION" && role !== "OWNER" && role !== "SUPPORT") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  let d = parsed.data;

  const existing = await prisma.job.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // SUPPORT restrictions:
  //  - can only edit jobs they created
  //  - cannot change: status, cancelled, etaManual, startedAt, finishedAt
  if (role === "SUPPORT") {
    if (existing.createdById !== (session.user as any).id) {
      return NextResponse.json({ error: "forbidden: not your job" }, { status: 403 });
    }
    d = {
      ...d,
      status: undefined,
      cancelled: undefined,
      etaManual: undefined,
      startedAt: undefined,
      finishedAt: undefined,
    };
  }

  // status side-effects
  let startedAt = existing.startedAt;
  let finishedAt = existing.finishedAt;
  if (d.status === "IN_PROGRESS" && !startedAt) startedAt = new Date();
  if (d.status === "DONE" && !finishedAt) finishedAt = new Date();

  const updated = await prisma.job.update({
    where: { id: ctx.params.id },
    data: {
      docNo: d.docNo ?? undefined,
      orderDate: d.orderDate ? new Date(d.orderDate) : undefined,
      deliveryTime: d.deliveryTime ?? undefined,
      customer: d.customer ?? undefined,
      item: d.item ?? undefined,
      qty: d.qty ?? undefined,
      cancelled: d.cancelled ?? undefined,
      notes: d.notes ?? undefined,
      assignedToId: d.assignedToId ?? undefined,
      salesOwnerId: d.salesOwnerId ?? undefined,
      status: d.status ?? undefined,
      startedAt,
      finishedAt,
      etaManual:
        d.etaManual === undefined
          ? undefined
          : d.etaManual === null
            ? null
            : new Date(d.etaManual),
    },
  });

  if (d.status && d.status !== existing.status) {
    await prisma.jobLog.create({
      data: {
        jobId: updated.id,
        status: d.status,
        message: `status: ${existing.status} → ${d.status}`,
      },
    });
  }

  // Recompute queue ETAs of OLD and NEW assignee (and unassigned bucket)
  await recomputeWorkerQueues([existing.assignedToId, updated.assignedToId]);

  const fresh = await prisma.job.findUnique({
    where: { id: ctx.params.id },
    include: {
      assignedTo: { select: { id: true, name: true, username: true } },
      salesOwner: { select: { id: true, name: true, username: true } },
    },
  });
  return NextResponse.json(fresh);
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  const meId = (session.user as any).id;
  if (role !== "PRODUCTION" && role !== "OWNER" && role !== "SUPPORT") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const existing = await prisma.job.findUnique({ where: { id: ctx.params.id } });
  if (!existing) return NextResponse.json({ ok: true });
  // SUPPORT can only delete own jobs
  if (role === "SUPPORT" && existing.createdById !== meId) {
    return NextResponse.json({ error: "forbidden: not your job" }, { status: 403 });
  }
  await prisma.job.delete({ where: { id: ctx.params.id } });
  await recomputeWorkerQueues([existing.assignedToId]);
  return NextResponse.json({ ok: true });
}
