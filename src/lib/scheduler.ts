// Auto ETA scheduler.
// Rules:
//  - 1 worker handles 1 job at a time (serial queue).
//  - Working days only (skip Sat/Sun).
//  - Rate per day:
//      * same item as previous job in this worker's queue → 8
//      * different item → 4
//      * unassigned worker → 6
//  - Queue ordering: by createdAt asc, filtered to status NOT in [DONE, CANCELLED] and not cancelled.

import { prisma } from "./prisma";

export const RATE_SAME = 8;
export const RATE_DIFF = 4;
export const RATE_UNASSIGNED = 6;

function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function workingDaysBetween(from: Date, to: Date): number {
  const start = nextWorkday(from);
  const end = nextWorkday(to);
  if (end.getTime() < start.getTime()) return 1;
  let count = 1;
  const d = new Date(start);
  while (d.getTime() < end.getTime()) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) count++;
  }
  return count;
}

export function deliveryLabel(days: number): string {
  if (days <= 1) return "1 วันทำการ";
  if (days <= 2) return "2 วันทำการ";
  if (days <= 5) return "3-5 วันทำการ";
  if (days <= 7) return "5-7 วันทำการ";
  if (days <= 14) return "7-14 วันทำการ";
  if (days <= 30) return "14-30 วันทำการ";
  return `${days} วันทำการ`;
}

function nextWorkday(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  while (isWeekend(r)) r.setDate(r.getDate() + 1);
  return r;
}

function addOneWorkday(d: Date): Date {
  const r = new Date(d);
  do {
    r.setDate(r.getDate() + 1);
  } while (isWeekend(r));
  return r;
}

// Compute end date given a start date and number of working days (inclusive of start).
// e.g. start=Mon, days=1 → Mon. days=5 → Fri. days=6 → next Mon.
export function computeWorkingEnd(start: Date, workingDays: number): Date {
  let d = nextWorkday(start);
  let remaining = Math.max(1, workingDays) - 1;
  while (remaining > 0) {
    d = addOneWorkday(d);
    remaining--;
  }
  return d;
}

type QueueJob = {
  id: string;
  assignedToId: string | null;
  qty: number;
  item: string;
  status: string;
  cancelled: boolean;
  createdAt: Date;
  etaAuto: Date | null;
  orderDate: Date;
};

// Find the latest ETA across all open assigned jobs (used as baseline for unassigned).
async function findLatestAssignedEta(): Promise<Date | null> {
  const latest = await prisma.job.findFirst({
    where: {
      cancelled: false,
      status: { notIn: ["DONE", "CANCELLED"] },
      assignedToId: { not: null },
      etaAuto: { not: null },
    },
    orderBy: { etaAuto: "desc" },
    select: { etaAuto: true },
  });
  return latest?.etaAuto ?? null;
}

// Recompute etaAuto for all "open" jobs of given worker IDs.
// Returns map jobId → etaAuto.
export async function recomputeWorkerQueues(workerIds: (string | null | undefined)[]) {
  const distinct = Array.from(new Set(workerIds.filter((x): x is string => !!x)));
  const updates: Record<string, Date> = {};

  // First, recompute ASSIGNED queues so latestAssignedEta is up-to-date.
  // (We re-run unassigned after to base on that)
  const orderedBuckets: (string | null)[] = [...distinct, null];

  // Also recompute the "unassigned bucket": jobs with no worker
  for (const wid of orderedBuckets) {
    const where: any = {
      assignedToId: wid,
      cancelled: false,
      status: { notIn: ["DONE", "CANCELLED"] },
    };
    const queue: QueueJob[] = await prisma.job.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, assignedToId: true, qty: true, item: true,
        status: true, cancelled: true, createdAt: true, etaAuto: true,
        orderDate: true,
      },
    });

    if (wid === null) {
      // Unassigned jobs: start from latest assigned ETA in system (worst-case baseline)
      // Persist any pending updates first so latestEta reflects updated assigned ETAs.
      if (Object.keys(updates).length) {
        const jobMeta0 = await prisma.job.findMany({
          where: { id: { in: Object.keys(updates) } },
          select: { id: true, orderDate: true, etaManual: true },
        });
        const om = new Map(jobMeta0.map((j) => [j.id, j]));
        await prisma.$transaction(
          Object.entries(updates).map(([id, etaAuto]) => {
            const meta = om.get(id);
            const order = meta?.orderDate ?? new Date();
            // If a manual ETA was entered, delivery reflects that real date, not the auto estimate.
            const effectiveEta = meta?.etaManual ?? etaAuto;
            const days = workingDaysBetween(order, effectiveEta);
            return prisma.job.update({
              where: { id },
              data: { etaAuto, deliveryTime: deliveryLabel(days) },
            });
          })
        );
      }
      const latest = await findLatestAssignedEta();
      const baseline = latest
        ? addOneWorkday(latest)
        : nextWorkday(new Date());
      let cursor = baseline;
      for (const j of queue) {
        const days = Math.max(1, Math.ceil(j.qty / RATE_UNASSIGNED));
        const end = computeWorkingEnd(cursor, days);
        updates[j.id] = end;
        cursor = addOneWorkday(end);
      }
    } else {
      // Serial queue per worker
      let cursor = nextWorkday(new Date());
      let prevItem: string | null = null;
      for (const j of queue) {
        const sameAsPrev = prevItem !== null && prevItem === j.item;
        const rate = sameAsPrev ? RATE_SAME : RATE_DIFF;
        const days = Math.max(1, Math.ceil(j.qty / rate));
        const end = computeWorkingEnd(cursor, days);
        updates[j.id] = end;
        cursor = addOneWorkday(end);
        prevItem = j.item;
      }
    }
  }

  // Compute deliveryTime label for each updated job.
  // Use the manual ETA when present (real entered date), otherwise the auto estimate.
  const jobMeta = await prisma.job.findMany({
    where: { id: { in: Object.keys(updates) } },
    select: { id: true, orderDate: true, etaManual: true },
  });
  const metaMap = new Map(jobMeta.map((j) => [j.id, j]));

  // Persist
  await prisma.$transaction(
    Object.entries(updates).map(([id, etaAuto]) => {
      const meta = metaMap.get(id);
      const order = meta?.orderDate ?? new Date();
      const effectiveEta = meta?.etaManual ?? etaAuto;
      const days = workingDaysBetween(order, effectiveEta);
      return prisma.job.update({
        where: { id },
        data: { etaAuto, deliveryTime: deliveryLabel(days) },
      });
    })
  );

  return updates;
}
