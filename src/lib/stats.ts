import type { Status } from "./eta";

export type JobLike = {
  id: string;
  status: Status;
  qty: number;
  cancelled: boolean;
  finishedAt: Date | string | null;
  assignedTo: { id: string; name: string } | null;
};

export type Overall = {
  totalJobs: number;
  waitingApproval: { jobs: number; qty: number };
  awaitingDelivery: { jobs: number; qty: number };
  pending: { jobs: number; qty: number };
  inProgress: { jobs: number; qty: number };
  paused: { jobs: number; qty: number };
  qc: { jobs: number; qty: number };
  doneThisMonth: { jobs: number; qty: number };
  cancelled: number;
};

export type WorkerStat = {
  id: string;
  name: string;
  doneThisMonth: { jobs: number; qty: number };
  inProgress: { jobs: number; qty: number };
  pending: { jobs: number; qty: number };
};

function isThisMonth(d?: Date | string | null) {
  if (!d) return false;
  const dt = new Date(d);
  const now = new Date();
  return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
}

export function computeOverall(jobs: JobLike[]): Overall {
  const o: Overall = {
    totalJobs: jobs.length,
    waitingApproval: { jobs: 0, qty: 0 },
    awaitingDelivery: { jobs: 0, qty: 0 },
    pending: { jobs: 0, qty: 0 },
    inProgress: { jobs: 0, qty: 0 },
    paused: { jobs: 0, qty: 0 },
    qc: { jobs: 0, qty: 0 },
    doneThisMonth: { jobs: 0, qty: 0 },
    cancelled: 0,
  };
  for (const j of jobs) {
    if (j.cancelled) {
      o.cancelled++;
      continue;
    }
    switch (j.status) {
      case "WAITING_APPROVAL":
        o.waitingApproval.jobs++;
        o.waitingApproval.qty += j.qty;
        break;
      case "AWAITING_DELIVERY":
        o.awaitingDelivery.jobs++;
        o.awaitingDelivery.qty += j.qty;
        break;
      case "PENDING":
        o.pending.jobs++;
        o.pending.qty += j.qty;
        break;
      case "IN_PROGRESS":
        o.inProgress.jobs++;
        o.inProgress.qty += j.qty;
        break;
      case "PAUSED":
        o.paused.jobs++;
        o.paused.qty += j.qty;
        break;
      case "QC":
        o.qc.jobs++;
        o.qc.qty += j.qty;
        break;
      case "DONE":
        if (isThisMonth(j.finishedAt)) {
          o.doneThisMonth.jobs++;
          o.doneThisMonth.qty += j.qty;
        }
        break;
    }
  }
  return o;
}

export function computeWorkers(jobs: JobLike[]): WorkerStat[] {
  const map = new Map<string, WorkerStat>();
  for (const j of jobs) {
    if (!j.assignedTo || j.cancelled) continue;
    const id = j.assignedTo.id;
    let w = map.get(id);
    if (!w) {
      w = {
        id,
        name: j.assignedTo.name,
        doneThisMonth: { jobs: 0, qty: 0 },
        inProgress: { jobs: 0, qty: 0 },
        pending: { jobs: 0, qty: 0 },
      };
      map.set(id, w);
    }
    if (j.status === "DONE" && isThisMonth(j.finishedAt)) {
      w.doneThisMonth.jobs++;
      w.doneThisMonth.qty += j.qty;
    } else if (j.status === "IN_PROGRESS" || j.status === "QC" || j.status === "PAUSED") {
      w.inProgress.jobs++;
      w.inProgress.qty += j.qty;
    } else if (j.status === "PENDING" || j.status === "AWAITING_DELIVERY") {
      // AWAITING_DELIVERY = approved + queued, waiting for shipping → counts as "waiting".
      w.pending.jobs++;
      w.pending.qty += j.qty;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.doneThisMonth.qty - a.doneThisMonth.qty
  );
}
