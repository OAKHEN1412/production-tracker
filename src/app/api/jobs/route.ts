import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeWorkerQueues } from "@/lib/scheduler";
import { reconcileJobMaterials, InsufficientStockError } from "@/lib/stock";
import { z } from "zod";

const materialsSchema = z
  .array(z.object({
    materialId: z.string(),
    qtyPerUnit: z.coerce.number().nonnegative(),
    cutLengthMm: z.coerce.number().nonnegative().optional(),
  }))
  .optional();

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
  materials: materialsSchema,
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

  // SUPPORT files a request, not a ready-to-run job: it lands in WAITING_APPROVAL
  // and PRODUCTION fills in the worker / materials / recipe at approval time.
  // So SUPPORT can't set status, ETA, assignee, or the bill of materials here.
  const isSupport = role === "SUPPORT";

  // docNo (customer document no.) may repeat across jobs — the job's identity is
  // its unique running `seq`, not docNo. No duplicate check here.
  const last = await prisma.job.findFirst({ orderBy: { seq: "desc" }, select: { seq: true } });
  const nextSeq = (last?.seq ?? 0) + 1;

  const finalStatus = isSupport ? "WAITING_APPROVAL" : data.status ?? "PENDING";
  // Mirror PATCH's status side-effects so a job created directly as IN_PROGRESS/DONE
  // gets its timestamps (otherwise "done this month" stats and history miss it).
  const now = new Date();
  const startedAt = finalStatus === "IN_PROGRESS" || finalStatus === "DONE" ? now : null;
  const finishedAt = finalStatus === "DONE" ? now : null;

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
      // SUPPORT can request a target delivery date (etaManual); they still can't set
      // the worker/BOM/status — PRODUCTION fills those at approval. etaManual survives
      // approval (the approve PATCH doesn't overwrite it).
      etaManual: data.etaManual ? new Date(data.etaManual) : null,
      assignedToId: isSupport ? null : data.assignedToId ?? null,
      salesOwnerId: data.salesOwnerId ?? null,
      status: finalStatus,
      startedAt,
      finishedAt,
      createdById: (session.user as any).id,
    },
  });

  await prisma.jobLog.create({
    data: { jobId: job.id, status: job.status, message: "created" },
  });

  // Bill of materials + deduct stock as soon as the job has materials.
  // SUPPORT requests carry no BOM yet — PRODUCTION sets it when approving.
  if (!isSupport && data.materials) {
    try {
      await reconcileJobMaterials({
        jobId: job.id,
        oldQty: job.qty,
        oldDeducted: false,
        oldMaterials: [],
        newQty: job.qty,
        newMaterials: data.materials,
        cancelled: finalStatus === "CANCELLED",
        statusForLog: job.status,
      });
    } catch (e) {
      if (e instanceof InsufficientStockError) {
        // Roll back the just-created job (cascades its log + BOM rows).
        await prisma.job.delete({ where: { id: job.id } });
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  }

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
