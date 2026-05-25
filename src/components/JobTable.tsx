"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  STATUSES,
  DELIVERY_OPTIONS,
  type Status,
} from "@/lib/eta";
import UploadExcel from "./UploadExcel";
import EtaPopup from "./EtaPopup";

type User = { id: string; name: string; username: string };

type Job = {
  id: string;
  seq: number;
  docNo: string;
  orderDate: string | Date;
  deliveryTime: string;
  customer: string;
  item: string;
  qty: number;
  cancelled: boolean;
  notes: string | null;
  status: Status;
  rate: number | null;
  etaAuto: string | Date | null;
  etaManual: string | Date | null;
  assignedTo: User | null;
  assignedToId: string | null;
  salesOwner: User | null;
  salesOwnerId: string | null;
  createdById: string;
};

function fmtDate(d?: string | Date | null) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("th-TH", { year: "2-digit", month: "2-digit", day: "2-digit" });
}
function toDateInput(d?: string | Date | null) {
  if (!d) return "";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

type SortKey = "seq" | "orderDate" | "docNo" | "customer" | "item" | "qty" | "assignedTo" | "status" | "eta" | "deliveryTime";

const SORT_LABEL: Record<SortKey, string> = {
  seq: "ลำดับ",
  orderDate: "วันสั่งผลิต",
  docNo: "เลขที่เอกสาร",
  customer: "ลูกค้า",
  item: "รายการ",
  qty: "จำนวน",
  assignedTo: "ผู้รับผิดชอบ",
  status: "สถานะ",
  eta: "ETA",
  deliveryTime: "Delivery",
};

const STATUS_ORDER: Record<Status, number> = {
  PENDING: 0, IN_PROGRESS: 1, PAUSED: 2, QC: 3, DONE: 4, CANCELLED: 5,
};

function sortJobs(arr: Job[], key: SortKey, dir: "asc" | "desc"): Job[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...arr].sort((a, b) => {
    let av: any, bv: any;
    switch (key) {
      case "seq": av = a.seq; bv = b.seq; break;
      case "qty": av = a.qty; bv = b.qty; break;
      case "orderDate": av = new Date(a.orderDate).getTime(); bv = new Date(b.orderDate).getTime(); break;
      case "eta":
        av = a.etaManual ? new Date(a.etaManual).getTime() : a.etaAuto ? new Date(a.etaAuto).getTime() : Infinity;
        bv = b.etaManual ? new Date(b.etaManual).getTime() : b.etaAuto ? new Date(b.etaAuto).getTime() : Infinity;
        break;
      case "status": av = STATUS_ORDER[a.status]; bv = STATUS_ORDER[b.status]; break;
      case "assignedTo": av = a.assignedTo?.name ?? "~"; bv = b.assignedTo?.name ?? "~"; break;
      case "docNo": av = a.docNo; bv = b.docNo; break;
      case "customer": av = a.customer; bv = b.customer; break;
      case "item": av = a.item; bv = b.item; break;
      case "deliveryTime": av = a.deliveryTime; bv = b.deliveryTime; break;
    }
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return 0;
  });
}

const NEXT_STATUS: Partial<Record<Status, { to: Status; label: string; cls: string }>> = {
  PENDING:     { to: "IN_PROGRESS", label: "▶ เริ่มผลิต",  cls: "bg-blue-600 hover:bg-blue-700" },
  IN_PROGRESS: { to: "QC",          label: "→ QC",         cls: "bg-purple-600 hover:bg-purple-700" },
  QC:          { to: "DONE",        label: "✓ เสร็จ",       cls: "bg-green-600 hover:bg-green-700" },
  PAUSED:      { to: "IN_PROGRESS", label: "▶ ผลิตต่อ",     cls: "bg-blue-600 hover:bg-blue-700" },
};

type Draft = {
  docNo: string;
  orderDate: string;
  deliveryTime: string;
  customer: string;
  item: string;
  qty: number;
  notes: string;
  status: Status;
  assignedToId: string;
  salesOwnerId: string;
  etaManual: string;
  rate: string;
  cancelled: boolean;
};

function emptyDraft(): Draft {
  return {
    docNo: "",
    orderDate: toDateInput(new Date()),
    deliveryTime: "3-5 วันทำการ",
    customer: "",
    item: "",
    qty: 1,
    notes: "",
    status: "PENDING",
    assignedToId: "",
    salesOwnerId: "",
    etaManual: "",
    rate: "",
    cancelled: false,
  };
}

function jobToDraft(j: Job): Draft {
  return {
    docNo: j.docNo,
    orderDate: toDateInput(j.orderDate),
    deliveryTime: j.deliveryTime,
    customer: j.customer,
    item: j.item,
    qty: j.qty,
    notes: j.notes ?? "",
    status: j.status,
    assignedToId: j.assignedToId ?? "",
    salesOwnerId: j.salesOwnerId ?? "",
    etaManual: toDateInput(j.etaManual),
    rate: j.rate == null ? "" : String(j.rate),
    cancelled: j.cancelled,
  };
}

const input = "border rounded px-2 py-1 text-xs w-full";

export default function JobTable({
  jobs: initial,
  users,
  salesUsers = [],
  canEdit,
  role,
  meId,
}: {
  jobs: Job[];
  users: User[];
  salesUsers?: User[];
  canEdit: boolean;
  role?: "OWNER" | "PRODUCTION" | "SUPPORT" | "SALES";
  meId?: string;
}) {
  const isSupport = role === "SUPPORT";
  const isFullEditor = role === "OWNER" || role === "PRODUCTION";
  const canRowEdit = (j: Job) =>
    isFullEditor || (isSupport && j.createdById === meId);
  const canRowDelete = (j: Job) =>
    isFullEditor || (isSupport && j.createdById === meId);
  const canRowStatus = isFullEditor;
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initial);
  // Keep table in sync with server data after router.refresh() (e.g. bulk Excel upload).
  useEffect(() => { setJobs(initial); }, [initial]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("seq");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Inline add
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);

  // ETA popup after save
  const [popup, setPopup] = useState<{ job: any; mode: "created" | "updated" } | null>(null);

  const filtered = useMemo(() => {
    const arr = jobs.filter((j) => {
      if (filter !== "ALL" && j.status !== filter) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return (
        j.docNo.toLowerCase().includes(s) ||
        j.customer.toLowerCase().includes(s) ||
        j.item.toLowerCase().includes(s) ||
        (j.assignedTo?.name.toLowerCase().includes(s) ?? false)
      );
    });
    return sortJobs(arr, sortKey, sortDir);
  }, [jobs, q, filter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }
  function arrow(key: SortKey) {
    if (sortKey !== key) return <span className="text-gray-300">↕</span>;
    return <span className="text-gray-700">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const counts = useMemo(() => {
    const map: Record<string, number> = { ALL: jobs.length };
    for (const s of STATUSES) map[s] = 0;
    jobs.forEach((j) => (map[j.status] = (map[j.status] ?? 0) + 1));
    return map;
  }, [jobs]);

  function payloadFromDraft(d: Draft) {
    return {
      docNo: d.docNo,
      orderDate: d.orderDate,
      deliveryTime: d.deliveryTime,
      customer: d.customer,
      item: d.item,
      qty: Number(d.qty),
      notes: d.notes || null,
      status: d.status,
      assignedToId: d.assignedToId || null,
      salesOwnerId: d.salesOwnerId || null,
      etaManual: d.etaManual || null,
      rate: d.rate === "" ? null : Number(d.rate),
      cancelled: d.cancelled,
    };
  }

  async function createJob() {
    setBusyId("__new");
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadFromDraft(draft)),
    });
    setBusyId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const msg = typeof j.error === "string" ? j.error : JSON.stringify(j.error);
      alert("สร้างไม่ได้: " + msg);
      return;
    }
    const created = await res.json();
    setAdding(false);
    setDraft(emptyDraft());
    router.refresh();
    const fresh = await fetch("/api/jobs").then((r) => r.json());
    setJobs(fresh);
    setPopup({ job: created, mode: "created" });
  }

  async function saveEdit() {
    if (!editId || !editDraft) return;
    setBusyId(editId);
    // Detect if ETA-relevant fields changed (assignee/qty/item/etaManual)
    const orig = jobs.find((j) => j.id === editId);
    const etaChanged = !!orig && (
      orig.assignedToId !== (editDraft.assignedToId || null) ||
      orig.qty !== Number(editDraft.qty) ||
      orig.item !== editDraft.item ||
      String(orig.etaManual ? new Date(orig.etaManual).toISOString().slice(0,10) : "") !== editDraft.etaManual
    );
    const res = await fetch(`/api/jobs/${editId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payloadFromDraft(editDraft)),
    });
    setBusyId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const msg = typeof j.error === "string" ? j.error : JSON.stringify(j.error);
      alert("บันทึกไม่ได้: " + msg);
      return;
    }
    const updated = await res.json();
    setEditId(null);
    setEditDraft(null);
    router.refresh();
    const fresh = await fetch("/api/jobs").then((r) => r.json());
    setJobs(fresh);
    if (etaChanged) setPopup({ job: updated, mode: "updated" });
  }

  async function setStatus(id: string, status: Status) {
    setBusyId(id);
    const res = await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!res.ok) {
      alert("อัปเดตไม่ได้");
      return;
    }
    // Re-fetch: status change recomputes the whole queue's ETA + delivery.
    const fresh = await fetch("/api/jobs").then((r) => r.json());
    setJobs(fresh);
    router.refresh();
  }

  async function del(id: string) {
    if (!confirm("ลบงานนี้?")) return;
    setBusyId(id);
    const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      alert("ลบไม่ได้");
      return;
    }
    // Re-fetch: delete recomputes the remaining queue's ETA + delivery.
    const fresh = await fetch("/api/jobs").then((r) => r.json());
    setJobs(fresh);
    router.refresh();
  }

  function beginEdit(j: Job) {
    setEditId(j.id);
    setEditDraft(jobToDraft(j));
  }
  function cancelEdit() {
    setEditId(null);
    setEditDraft(null);
  }

  return (
    <div className="space-y-3">
      {popup && <EtaPopup job={popup.job} mode={popup.mode} onClose={() => setPopup(null)} />}

      {/* Toolbar */}
      <div className="bg-white p-3 rounded shadow flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="border rounded px-3 py-2 text-sm flex-1"
            placeholder="🔍 ค้นหา doc, ลูกค้า, รายการ, ผู้รับผิดชอบ..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setAdding(!adding)}
                className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded whitespace-nowrap"
              >
                {adding ? "✕ ปิดฟอร์ม" : "+ เพิ่มงานใหม่"}
              </button>
              <UploadExcel />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")}
            label={`ทั้งหมด (${counts.ALL})`} cls="bg-gray-700 text-white" />
          {STATUSES.map((s) => (
            <FilterChip key={s}
              active={filter === s}
              onClick={() => setFilter(s)}
              label={`${STATUS_LABEL[s]} (${counts[s] ?? 0})`}
              cls={STATUS_COLOR[s]} />
          ))}
          <div className="ml-auto flex items-center gap-1 text-xs">
            <span className="text-gray-500">เรียง:</span>
            <select className="border rounded px-2 py-1 text-xs"
              value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABEL[k]}</option>
              ))}
            </select>
            <button onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
              className="border rounded px-2 py-1 hover:bg-gray-50"
              title={sortDir === "asc" ? "น้อย→มาก" : "มาก→น้อย"}>
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
        </div>
      </div>

      {/* Inline create */}
      {adding && canEdit && (
        <div className="bg-white p-4 rounded shadow border-2 border-green-400">
          <div className="font-semibold mb-3 text-sm">+ งานใหม่</div>
          <DraftFields draft={draft} setDraft={setDraft} users={users} salesUsers={salesUsers} />
          <div className="flex gap-2 mt-3 justify-end">
            <button onClick={() => { setAdding(false); setDraft(emptyDraft()); }}
              className="px-4 py-1.5 text-sm border rounded">ยกเลิก</button>
            <button onClick={createJob}
              disabled={busyId === "__new" || !draft.docNo || !draft.customer || !draft.item}
              className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50">
              {busyId === "__new" ? "..." : "บันทึก"}
            </button>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded shadow overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortTh k="seq" sortKey={sortKey} arrow={arrow} onClick={toggleSort}>#</SortTh>
              <SortTh k="orderDate" sortKey={sortKey} arrow={arrow} onClick={toggleSort}>สั่งผลิต</SortTh>
              <SortTh k="docNo" sortKey={sortKey} arrow={arrow} onClick={toggleSort}>เลขที่เอกสาร</SortTh>
              <SortTh k="customer" sortKey={sortKey} arrow={arrow} onClick={toggleSort}>ลูกค้า</SortTh>
              <SortTh k="item" sortKey={sortKey} arrow={arrow} onClick={toggleSort}>รายการ</SortTh>
              <SortTh k="qty" sortKey={sortKey} arrow={arrow} onClick={toggleSort} center>จำนวน</SortTh>
              <SortTh k="assignedTo" sortKey={sortKey} arrow={arrow} onClick={toggleSort}>ผู้รับผิดชอบ</SortTh>
              <th>เซล</th>
              <SortTh k="status" sortKey={sortKey} arrow={arrow} onClick={toggleSort}>สถานะ</SortTh>
              <SortTh k="eta" sortKey={sortKey} arrow={arrow} onClick={toggleSort}>ETA</SortTh>
              <SortTh k="deliveryTime" sortKey={sortKey} arrow={arrow} onClick={toggleSort}>Delivery</SortTh>
              <th className="text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={12} className="text-center text-gray-500 py-8">ไม่มีงานในเงื่อนไขนี้</td></tr>
            )}
            {filtered.map((j) => {
              const isEdit = editId === j.id && editDraft;
              if (isEdit) {
                return (
                  <tr key={j.id} className="bg-yellow-50">
                    <td className="text-center font-mono text-xs">{j.seq}</td>
                    <td><input type="date" className={input} value={editDraft!.orderDate}
                      onChange={(e) => setEditDraft({ ...editDraft!, orderDate: e.target.value })} /></td>
                    <td><input className={input} value={editDraft!.docNo}
                      onChange={(e) => setEditDraft({ ...editDraft!, docNo: e.target.value })} /></td>
                    <td><input className={input} value={editDraft!.customer}
                      onChange={(e) => setEditDraft({ ...editDraft!, customer: e.target.value })} /></td>
                    <td><input className={input} value={editDraft!.item}
                      onChange={(e) => setEditDraft({ ...editDraft!, item: e.target.value })} /></td>
                    <td><input type="number" min={1} className={input + " text-center"} value={editDraft!.qty}
                      onChange={(e) => setEditDraft({ ...editDraft!, qty: Number(e.target.value) })} /></td>
                    <td>
                      <select className={input} value={editDraft!.assignedToId}
                        onChange={(e) => setEditDraft({ ...editDraft!, assignedToId: e.target.value })}>
                        <option value="">- ไม่กำหนด -</option>
                        {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className={input} value={editDraft!.salesOwnerId}
                        onChange={(e) => setEditDraft({ ...editDraft!, salesOwnerId: e.target.value })}>
                        <option value="">- ไม่ระบุ -</option>
                        {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className={input} value={editDraft!.status}
                        onChange={(e) => setEditDraft({ ...editDraft!, status: e.target.value as Status })}>
                        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
                    <td><input type="date" className={input} value={editDraft!.etaManual}
                      onChange={(e) => setEditDraft({ ...editDraft!, etaManual: e.target.value })} /></td>
                    <td className="text-xs text-gray-400">auto</td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={saveEdit} disabled={busyId === j.id}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded mr-1 disabled:opacity-50">
                        ✓ บันทึก
                      </button>
                      <button onClick={cancelEdit}
                        className="text-gray-600 text-xs px-2 py-1 hover:underline mr-1">
                        ยกเลิก
                      </button>
                      {canRowDelete(j) && (
                        <button onClick={() => del(j.id)} disabled={busyId === j.id}
                          className="text-red-600 text-xs px-2 py-1 hover:underline disabled:opacity-50">
                          🗑 ลบ
                        </button>
                      )}
                    </td>
                  </tr>
                );
              }
              const nxt = NEXT_STATUS[j.status];
              return (
                <tr key={j.id}
                  className={`${j.cancelled ? "cancelled" : ""} ${canRowEdit(j) ? "cursor-pointer" : ""}`}
                  onDoubleClick={() => canRowEdit(j) && beginEdit(j)}
                  title={canRowEdit(j) ? "ดับเบิลคลิกเพื่อแก้ไข" : undefined}>
                  <td className="text-center font-mono text-xs">{j.seq}</td>
                  <td className="whitespace-nowrap">{fmtDate(j.orderDate)}</td>
                  <td className="font-mono text-xs">{j.docNo}</td>
                  <td>{j.customer}</td>
                  <td className="font-mono text-xs">{j.item}</td>
                  <td className="text-center font-semibold">{j.qty}</td>
                  <td className="text-xs">
                    {j.assignedTo?.name ?? <span className="text-gray-400">-</span>}
                  </td>
                  <td className="text-xs">
                    {j.salesOwner?.name ?? <span className="text-gray-400">-</span>}
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${STATUS_COLOR[j.status]}`}>
                      {STATUS_LABEL[j.status]}
                    </span>
                  </td>
                  <td className="text-xs whitespace-nowrap">
                    {j.etaManual ? fmtDate(j.etaManual)
                      : j.etaAuto ? <span className="text-gray-600">{fmtDate(j.etaAuto)}</span>
                      : "-"}
                  </td>
                  <td className="text-xs">{j.deliveryTime}</td>
                  <td className="text-right whitespace-nowrap" onDoubleClick={(e) => e.stopPropagation()}>
                    {canRowStatus && nxt && !j.cancelled && (
                      <button
                        disabled={busyId === j.id}
                        onClick={() => setStatus(j.id, nxt.to)}
                        className={`text-white text-xs px-2 py-1 rounded mr-1 ${nxt.cls} disabled:opacity-50`}
                      >
                        {nxt.label}
                      </button>
                    )}
                    {canRowEdit(j) ? (
                      <button onClick={() => beginEdit(j)}
                        className="text-blue-600 text-xs px-2 py-1 hover:underline">
                        ✎ แก้
                      </button>
                    ) : (
                      <Link href={`/jobs/${j.id}`}
                        className="text-blue-600 text-xs px-2 py-1 hover:underline">
                        ดู
                      </Link>
                    )}
                    {canRowDelete(j) && (
                      <button onClick={() => del(j.id)}
                        disabled={busyId === j.id}
                        className="text-red-600 text-xs px-2 py-1 hover:underline disabled:opacity-50">
                        ลบ
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 && (
          <div className="bg-white rounded shadow p-6 text-center text-gray-500 text-sm">
            ไม่มีงานในเงื่อนไขนี้
          </div>
        )}
        {filtered.map((j) => {
          const isEdit = editId === j.id && editDraft;
          if (isEdit) {
            return (
              <div key={j.id} className="bg-white rounded shadow p-3 border-2 border-yellow-400 space-y-2">
                <div className="text-xs text-gray-500 font-mono">#{j.seq} กำลังแก้ไข</div>
                <DraftFields draft={editDraft!} setDraft={(d) => setEditDraft(d)} users={users} salesUsers={salesUsers} compact />
                <div className="flex gap-2 pt-2 border-t flex-wrap">
                  <button onClick={cancelEdit}
                    className="text-xs px-3 py-1.5 rounded border">ยกเลิก</button>
                  {canRowDelete(j) && (
                    <button onClick={() => del(j.id)} disabled={busyId === j.id}
                      className="text-xs px-3 py-1.5 rounded border border-red-600 text-red-600 disabled:opacity-50">
                      🗑 ลบ
                    </button>
                  )}
                  <button onClick={saveEdit} disabled={busyId === j.id}
                    className="text-xs px-3 py-1.5 rounded bg-green-600 text-white ml-auto disabled:opacity-50">
                    ✓ บันทึก
                  </button>
                </div>
              </div>
            );
          }
          const nxt = NEXT_STATUS[j.status];
          return (
            <div key={j.id}
              onDoubleClick={() => canRowEdit(j) && beginEdit(j)}
              className={`bg-white rounded shadow p-3 ${j.cancelled ? "opacity-60" : ""} ${canRowEdit(j) ? "cursor-pointer" : ""}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500 font-mono">#{j.seq}</span>
                    <span className="font-mono text-xs">{j.docNo}</span>
                    {j.cancelled && <span className="text-red-600 text-xs">ยกเลิก</span>}
                  </div>
                  <div className="font-semibold text-sm truncate">{j.customer}</div>
                  <div className="text-xs text-gray-600 font-mono truncate">{j.item}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${STATUS_COLOR[j.status]}`}>
                  {STATUS_LABEL[j.status]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2 text-xs">
                <div><span className="text-gray-500">จำนวน:</span> <b>{j.qty}</b></div>
                <div><span className="text-gray-500">สั่ง:</span> {fmtDate(j.orderDate)}</div>
                <div className="col-span-2"><span className="text-gray-500">ผู้รับผิดชอบ:</span> {j.assignedTo?.name ?? "-"}</div>
                <div className="col-span-2"><span className="text-gray-500">เซล:</span> {j.salesOwner?.name ?? "-"}</div>
                <div className="col-span-2"><span className="text-gray-500">ETA:</span>{" "}
                  {j.etaManual ? fmtDate(j.etaManual) : j.etaAuto ? fmtDate(j.etaAuto) : "-"}
                </div>
                <div className="col-span-2"><span className="text-gray-500">Delivery:</span> {j.deliveryTime}</div>
                {j.notes && <div className="col-span-2 text-gray-600 italic mt-1">{j.notes}</div>}
              </div>

              {canRowEdit(j) || canRowStatus ? (
                <div className="flex gap-2 mt-3 pt-2 border-t flex-wrap" onDoubleClick={(e) => e.stopPropagation()}>
                  {canRowStatus && nxt && !j.cancelled && (
                    <button
                      disabled={busyId === j.id}
                      onClick={() => setStatus(j.id, nxt.to)}
                      className={`text-white text-xs px-3 py-1.5 rounded ${nxt.cls} disabled:opacity-50`}
                    >
                      {nxt.label}
                    </button>
                  )}
                  {canRowEdit(j) && (
                    <button onClick={() => beginEdit(j)}
                      className="text-xs px-3 py-1.5 rounded border border-blue-600 text-blue-600">
                      ✎ แก้ไข
                    </button>
                  )}
                  {canRowDelete(j) && (
                    <button onClick={() => del(j.id)}
                      disabled={busyId === j.id}
                      className="text-xs px-3 py-1.5 rounded border border-red-600 text-red-600 disabled:opacity-50 ml-auto">
                      ลบ
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-3 pt-2 border-t">
                  <Link href={`/jobs/${j.id}`} className="text-xs text-blue-600">ดูรายละเอียด →</Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SortTh({ k, sortKey, arrow, onClick, center, children }: {
  k: SortKey;
  sortKey: SortKey;
  arrow: (k: SortKey) => any;
  onClick: (k: SortKey) => void;
  center?: boolean;
  children: React.ReactNode;
}) {
  return (
    <th
      onClick={() => onClick(k)}
      className={`cursor-pointer select-none hover:bg-yellow-200 ${center ? "text-center" : ""}`}
      title="คลิกเพื่อเรียง"
    >
      <span className="inline-flex items-center gap-1">
        {children} {arrow(k)}
      </span>
    </th>
  );
}

function FilterChip({ active, onClick, label, cls }:
  { active: boolean; onClick: () => void; label: string; cls: string }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition
        ${active ? cls + " border-transparent font-semibold" : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"}`}
    >
      {label}
    </button>
  );
}

function DraftFields({
  draft,
  setDraft,
  users,
  salesUsers = [],
  compact,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  users: User[];
  salesUsers?: User[];
  compact?: boolean;
}) {
  const lbl = "text-xs text-gray-600";
  const inp = "border rounded px-2 py-1.5 w-full text-sm";
  const gridCls = compact ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 sm:grid-cols-2 gap-3";
  return (
    <div className={gridCls}>
      <div>
        <div className={lbl}>เลขที่เอกสาร *</div>
        <input className={inp} value={draft.docNo}
          onChange={(e) => setDraft({ ...draft, docNo: e.target.value })} />
      </div>
      <div>
        <div className={lbl}>วันที่สั่งผลิต *</div>
        <input type="date" className={inp} value={draft.orderDate}
          onChange={(e) => setDraft({ ...draft, orderDate: e.target.value })} />
      </div>
      <div>
        <div className={lbl}>ผลิตให้กับ บ. *</div>
        <input className={inp} value={draft.customer}
          onChange={(e) => setDraft({ ...draft, customer: e.target.value })} />
      </div>
      <div>
        <div className={lbl}>รายการผลิต *</div>
        <input className={inp} value={draft.item}
          onChange={(e) => setDraft({ ...draft, item: e.target.value })} />
      </div>
      <div>
        <div className={lbl}>จำนวน *</div>
        <input type="number" min={1} className={inp} value={draft.qty}
          onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })} />
      </div>
      <div>
        <div className={lbl}>ผู้รับผิดชอบ</div>
        <select className={inp} value={draft.assignedToId}
          onChange={(e) => setDraft({ ...draft, assignedToId: e.target.value })}>
          <option value="">- ไม่กำหนด -</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div>
        <div className={lbl}>งานของเซล</div>
        <select className={inp} value={draft.salesOwnerId}
          onChange={(e) => setDraft({ ...draft, salesOwnerId: e.target.value })}>
          <option value="">- ไม่ระบุ -</option>
          {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
      </div>
      <div>
        <div className={lbl}>สถานะ</div>
        <select className={inp} value={draft.status}
          onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <div>
        <div className={lbl}>ETA Manual</div>
        <input type="date" className={inp} value={draft.etaManual}
          onChange={(e) => setDraft({ ...draft, etaManual: e.target.value })} />
      </div>
    </div>
  );
}
