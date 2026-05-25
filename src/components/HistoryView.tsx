"use client";
import { Fragment, useMemo, useState } from "react";
import { STATUS_LABEL, STATUS_COLOR, STATUSES, type Status } from "@/lib/eta";
import { computeDurations, fmtDuration } from "@/lib/history";

type Log = { status: string; createdAt: string; message: string | null };
type Job = {
  id: string;
  seq: number;
  docNo: string;
  customer: string;
  item: string;
  qty: number;
  status: Status;
  orderDate: string;
  startedAt: string | null;
  finishedAt: string | null;
  assignedTo: { name: string } | null;
  salesOwner: { name: string } | null;
  logs: Log[];
};

function fmtDateTime(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

// statuses worth showing a duration bar for (skip terminal)
const TRACKED: Status[] = ["PENDING", "IN_PROGRESS", "PAUSED", "QC"];

export default function HistoryView({ jobs }: { jobs: Job[] }) {
  const [onlyDone, setOnlyDone] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const arr = jobs
      .filter((j) => (onlyDone ? j.status === "DONE" : true))
      .map((j) => ({ job: j, dur: computeDurations(j.logs) }));
    // done jobs newest-first (by finishedAt); others by seq desc
    arr.sort((a, b) => {
      const af = a.job.finishedAt ? new Date(a.job.finishedAt).getTime() : 0;
      const bf = b.job.finishedAt ? new Date(b.job.finishedAt).getTime() : 0;
      if (af !== bf) return bf - af;
      return b.job.seq - a.job.seq;
    });
    return arr;
  }, [jobs, onlyDone]);

  const summary = useMemo(() => {
    const done = jobs.filter((j) => j.status === "DONE");
    const totals = done.map((j) => computeDurations(j.logs).totalMs);
    const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    return { doneCount: done.length, avgMs: avg };
  }, [jobs]);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="bg-white rounded shadow p-3">
          <div className="text-xs text-gray-500">งานที่เสร็จแล้ว</div>
          <div className="text-xl font-bold">{summary.doneCount}</div>
        </div>
        <div className="bg-white rounded shadow p-3">
          <div className="text-xs text-gray-500">เวลาเฉลี่ย / งาน (เสร็จ)</div>
          <div className="text-xl font-bold">{summary.doneCount ? fmtDuration(summary.avgMs) : "-"}</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setOnlyDone(true)}
          className={`px-3 py-1.5 rounded-full border text-xs ${
            onlyDone ? "bg-green-600 text-white border-transparent font-semibold" : "bg-white border-gray-300 text-gray-600"
          }`}
        >
          เฉพาะที่เสร็จ
        </button>
        <button
          onClick={() => setOnlyDone(false)}
          className={`px-3 py-1.5 rounded-full border text-xs ${
            !onlyDone ? "bg-gray-700 text-white border-transparent font-semibold" : "bg-white border-gray-300 text-gray-600"
          }`}
        >
          ทั้งหมด
        </button>
        <span className="text-xs text-gray-500 ml-auto">{rows.length} รายการ</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>เลขที่เอกสาร</th>
              <th>ลูกค้า</th>
              <th>รายการ</th>
              <th>ผู้รับผิดชอบ</th>
              <th>สถานะ</th>
              <th>เริ่ม → เสร็จ</th>
              <th>เวลารวม</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="text-center text-gray-500 py-8">ยังไม่มีงาน</td></tr>
            )}
            {rows.map(({ job: j, dur }) => {
              const isOpen = openId === j.id;
              return (
                <Fragment key={j.id}>
                  <tr
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => setOpenId(isOpen ? null : j.id)}
                  >
                    <td className="text-center font-mono text-xs">{j.seq}</td>
                    <td className="font-mono text-xs">{j.docNo}</td>
                    <td>{j.customer}</td>
                    <td className="font-mono text-xs">{j.item}</td>
                    <td className="text-xs">{j.assignedTo?.name ?? <span className="text-gray-400">-</span>}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${STATUS_COLOR[j.status]}`}>
                        {STATUS_LABEL[j.status]}
                      </span>
                    </td>
                    <td className="text-xs whitespace-nowrap text-gray-600">
                      {fmtDateTime(j.startedAt)} → {fmtDateTime(j.finishedAt)}
                    </td>
                    <td className="text-xs font-semibold whitespace-nowrap">
                      {fmtDuration(dur.totalMs)}{!dur.done && <span className="text-gray-400"> (กำลังทำ)</span>}
                    </td>
                    <td className="text-xs text-blue-600 text-center">{isOpen ? "▲" : "▼"}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50">
                      <td colSpan={9} className="p-3">
                        <div className="text-xs font-semibold mb-2">เวลาแต่ละสถานะ</div>
                        <div className="space-y-1.5 max-w-2xl">
                          {TRACKED.map((s) => {
                            const ms = dur.byStatus[s] ?? 0;
                            const pct = dur.totalMs > 0 ? Math.round((ms / dur.totalMs) * 100) : 0;
                            return (
                              <div key={s} className="flex items-center gap-2 text-xs">
                                <span className={`px-2 py-0.5 rounded whitespace-nowrap w-28 text-center ${STATUS_COLOR[s]}`}>
                                  {STATUS_LABEL[s]}
                                </span>
                                <div className="flex-1 bg-gray-200 rounded h-3 overflow-hidden">
                                  <div className="bg-blue-500 h-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-32 text-right text-gray-700">{fmtDuration(ms)}</span>
                              </div>
                            );
                          })}
                        </div>

                        <div className="text-xs font-semibold mt-3 mb-1">Timeline</div>
                        <ul className="text-xs text-gray-600 space-y-0.5">
                          {[...j.logs]
                            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                            .map((l, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="text-gray-400 font-mono whitespace-nowrap">{fmtDateTime(l.createdAt)}</span>
                                <span className={`px-1.5 rounded ${STATUS_COLOR[l.status as Status] ?? "bg-gray-100"}`}>
                                  {STATUS_LABEL[l.status as Status] ?? l.status}
                                </span>
                                {l.message && <span className="text-gray-400">— {l.message}</span>}
                              </li>
                            ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
