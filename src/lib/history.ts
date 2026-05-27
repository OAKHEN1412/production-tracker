// Compute how long a job spent in each status, from its JobLog timeline.
// Each JobLog records the status the job ENTERED at `createdAt`. The time spent
// in that status is the gap until the next log (or until now, if still open).

export type LogEntry = {
  status: string;
  createdAt: string | Date;
  message?: string | null;
};

export type StatusSegment = {
  status: string;
  from: string; // ISO
  to: string | null; // ISO, null = ongoing
  ms: number;
};

export type DurationResult = {
  segments: StatusSegment[];
  byStatus: Record<string, number>; // total ms per status (summed across re-entries)
  totalMs: number; // first log → terminal (DONE/CANCELLED) or now
  done: boolean;
};

const TERMINAL = new Set(["DONE", "CANCELLED"]);

export function computeDurations(logs: LogEntry[], now: number = Date.now()): DurationResult {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const segments: StatusSegment[] = [];
  const byStatus: Record<string, number> = {};

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    const start = new Date(cur.createdAt).getTime();
    const isLast = i === sorted.length - 1;

    let end: number;
    let ongoing = false;
    if (!isLast) {
      end = new Date(sorted[i + 1].createdAt).getTime();
    } else if (TERMINAL.has(cur.status)) {
      end = start; // terminal status has no measured duration
    } else {
      end = now; // still in this status
      ongoing = true;
    }

    const ms = Math.max(0, end - start);
    segments.push({
      status: cur.status,
      from: new Date(start).toISOString(),
      to: ongoing ? null : new Date(end).toISOString(),
      ms,
    });
    byStatus[cur.status] = (byStatus[cur.status] ?? 0) + ms;
  }

  const last = sorted[sorted.length - 1];
  const done = !!last && TERMINAL.has(last.status);

  let totalMs = 0;
  if (sorted.length) {
    const first = new Date(sorted[0].createdAt).getTime();
    const endTotal = done ? new Date(last.createdAt).getTime() : now;
    totalMs = Math.max(0, endTotal - first);
  }

  return { segments, byStatus, totalMs, done };
}

export function fmtDuration(ms: number): string {
  if (ms <= 0) return "0 นาที";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} วัน`);
  if (hours) parts.push(`${hours} ชม.`);
  if (mins || parts.length === 0) parts.push(`${mins} นาที`);
  return parts.join(" ");
}
