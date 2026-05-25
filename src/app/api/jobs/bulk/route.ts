import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeWorkerQueues } from "@/lib/scheduler";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "PRODUCTION" && role !== "OWNER" && role !== "SUPPORT") {
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
  const ts = Date.now();

  function parseDate(v: any): Date {
    if (!v) return new Date();
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? new Date() : d;
  }
  function parseDateOrNull(v: any): Date | null {
    if (!v) return null;
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? null : d;
  }

  for (let i = 0; i < body.rows.length; i++) {
    const raw = body.rows[i] ?? {};
    try {
      const docNo = String(raw.docNo ?? "").trim() || `AUTO-${ts}-${i + 1}`;
      const qty = Number(raw.qty);
      const assignedToId = raw.assignedToName
        ? userByName.get(String(raw.assignedToName).trim().toLowerCase()) ?? null
        : null;

      const job = await prisma.job.create({
        data: {
          seq: nextSeq++,
          docNo,
          orderDate: parseDate(raw.orderDate),
          deliveryTime: String(raw.deliveryTime ?? "").trim() || "-",
          customer: String(raw.customer ?? "").trim() || "-",
          item: String(raw.item ?? "").trim() || "-",
          qty: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
          status: raw.checkDone === true ? "DONE" : (raw.status || "PENDING"),
          finishedAt: raw.checkDone === true ? new Date() : null,
          assignedToId,
          etaManual: parseDateOrNull(raw.etaManual),
          createdById: (session.user as any).id,
        },
      });
      created.push(job);
    } catch (e: any) {
      errors.push({ row: i + 1, error: e?.message ?? "unknown" });
    }
  }

  // Seed an initial log per imported job so the production-history timeline is consistent.
  if (created.length) {
    await prisma.jobLog.createMany({
      data: created.map((j) => ({ jobId: j.id, status: j.status, message: "imported" })),
    });
  }

  // Recompute ETAs for all affected workers
  const affected = Array.from(new Set(created.map((j) => j.assignedToId).filter((v): v is string => !!v)));
  await recomputeWorkerQueues([...affected, null]);

  return NextResponse.json({
    createdCount: created.length,
    errorCount: errors.length,
    errors,
  });
}
