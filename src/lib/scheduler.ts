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

export function pickRate(opts: { assigned: boolean; sameAsPrev: boolean }) {
  if (!opts.assigned) return RATE_UNASSIGNED;
  return opts.sameAsPrev ? RATE_SAME : RATE_DIFF;
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
};

// Recompute etaAuto for all "open" jobs of given worker IDs.
// Returns map jobId → etaAuto.
export async function recomputeWorkerQueues(workerIds: (string | null | undefined)[]) {
  const distinct = Array.from(new Set(workerIds.filter((x): x is string => !!x)));
  const updates: Record<string, Date> = {};

  // Also recompute the "unassigned bucket": jobs with no worker (rate 6, each independent)
  for (const wid of [...distinct, null as string | null]) {
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
      },
    });

    if (wid === null) {
      // Unassigned jobs: each independent, start = today, rate 6
      const start = nextWorkday(new Date());
      for (const j of queue) {
        const days = Math.max(1, Math.ceil(j.qty / RATE_UNASSIGNED));
        const eta = computeWorkingEnd(start, days);
        updates[j.id] = eta;
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

  // Persist
  await prisma.$transaction(
    Object.entries(updates).map(([id, etaAuto]) =>
      prisma.job.update({ where: { id }, data: { etaAuto } })
    )
  );

  return updates;
}

// Preview without persisting — compute ETA for a hypothetical new/edited job
// (used to show popup before save, but here we just call recompute after save and read back).
export async function previewJobEta(input: {
  jobId?: string | null;          // exclude self if editing
  assignedToId: string | null;
  qty: number;
  item: string;
}): Promise<{ eta: Date; rate: number; queuePosition: number; sameAsPrev: boolean }> {
  const { assignedToId, qty, item, jobId } = input;

  if (!assignedToId) {
    const start = nextWorkday(new Date());
    const days = Math.max(1, Math.ceil(qty / RATE_UNASSIGNED));
    return {
      eta: computeWorkingEnd(start, days),
      rate: RATE_UNASSIGNED,
      queuePosition: 1,
      sameAsPrev: false,
    };
  }

  const queue = await prisma.job.findMany({
    where: {
      assignedToId,
      cancelled: false,
      status: { notIn: ["DONE", "CANCELLED"] },
      ...(jobId ? { NOT: { id: jobId } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { qty: true, item: true, createdAt: true },
  });

  // Simulate appending the new job at end
  let cursor = nextWorkday(new Date());
  let prevItem: string | null = null;
  for (const j of queue) {
    const sameAsPrev = prevItem !== null && prevItem === j.item;
    const rate = sameAsPrev ? RATE_SAME : RATE_DIFF;
    const days = Math.max(1, Math.ceil(j.qty / rate));
    cursor = addOneWorkday(computeWorkingEnd(cursor, days));
    prevItem = j.item;
  }
  const sameAsPrev = prevItem !== null && prevItem === item;
  const rate = sameAsPrev ? RATE_SAME : RATE_DIFF;
  const days = Math.max(1, Math.ceil(qty / rate));
  const eta = computeWorkingEnd(cursor, days);
  return { eta, rate, queuePosition: queue.length + 1, sameAsPrev };
}
