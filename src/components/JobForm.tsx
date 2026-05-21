"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUSES, STATUS_LABEL, DELIVERY_OPTIONS, type Status } from "@/lib/eta";

type User = { id: string; name: string; username: string };

type Initial = {
  id?: string;
  docNo?: string;
  orderDate?: string | Date;
  deliveryTime?: string;
  customer?: string;
  item?: string;
  qty?: number;
  cancelled?: boolean;
  notes?: string | null;
  rate?: number | null;
  etaManual?: string | Date | null;
  assignedToId?: string | null;
  status?: Status;
};

function toDateInput(d?: string | Date | null) {
  if (!d) return "";
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function JobForm({ users, initial }: { users: User[]; initial?: Initial }) {
  const router = useRouter();
  const editing = !!initial?.id;

  const [f, setF] = useState({
    docNo: initial?.docNo ?? "",
    orderDate: toDateInput(initial?.orderDate) || toDateInput(new Date()),
    deliveryTime: initial?.deliveryTime ?? "3-5 วันทำการ",
    customer: initial?.customer ?? "",
    item: initial?.item ?? "",
    qty: initial?.qty ?? 1,
    cancelled: initial?.cancelled ?? false,
    notes: initial?.notes ?? "",
    rate: initial?.rate ?? "",
    etaManual: toDateInput(initial?.etaManual),
    assignedToId: initial?.assignedToId ?? "",
    status: initial?.status ?? "PENDING",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const payload: any = {
      ...f,
      qty: Number(f.qty),
      rate: f.rate === "" ? null : Number(f.rate),
      etaManual: f.etaManual || null,
      assignedToId: f.assignedToId || null,
    };
    const url = editing ? `/api/jobs/${initial!.id}` : "/api/jobs";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(JSON.stringify(j.error || "error"));
      return;
    }
    router.push("/");
    router.refresh();
  }

  async function onDelete() {
    if (!editing) return;
    if (!confirm("ลบงานนี้?")) return;
    const res = await fetch(`/api/jobs/${initial!.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/");
      router.refresh();
    }
  }

  const input = "border rounded px-3 py-2 w-full text-sm";
  const label = "text-xs text-gray-600";

  return (
    <form onSubmit={submit} className="bg-white p-4 rounded shadow grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <div className={label}>เลขที่เอกสาร *</div>
        <input className={input} required value={f.docNo}
          onChange={(e) => setF({ ...f, docNo: e.target.value })} />
      </div>
      <div>
        <div className={label}>วันที่สั่งผลิต *</div>
        <input type="date" className={input} required value={f.orderDate}
          onChange={(e) => setF({ ...f, orderDate: e.target.value })} />
      </div>
      <div>
        <div className={label}>ผลิตให้กับ บ. *</div>
        <input className={input} required value={f.customer}
          onChange={(e) => setF({ ...f, customer: e.target.value })} />
      </div>
      <div>
        <div className={label}>Delivery time *</div>
        <select className={input} required value={f.deliveryTime}
          onChange={(e) => setF({ ...f, deliveryTime: e.target.value })}>
          {DELIVERY_OPTIONS.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
      <div>
        <div className={label}>รายการผลิต *</div>
        <input className={input} required value={f.item}
          onChange={(e) => setF({ ...f, item: e.target.value })} />
      </div>
      <div>
        <div className={label}>จำนวนที่ผลิต *</div>
        <input type="number" min={1} className={input} required value={f.qty}
          onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} />
      </div>

      <div>
        <div className={label}>ผู้รับผิดชอบ</div>
        <select className={input} value={f.assignedToId}
          onChange={(e) => setF({ ...f, assignedToId: e.target.value })}>
          <option value="">- ยังไม่กำหนด -</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
          ))}
        </select>
      </div>
      <div>
        <div className={label}>สถานะ</div>
        <select className={input} value={f.status}
          onChange={(e) => setF({ ...f, status: e.target.value as Status })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <div className={label}>ETA Manual (กำหนดเอง)</div>
        <input type="date" className={input} value={f.etaManual}
          onChange={(e) => setF({ ...f, etaManual: e.target.value })} />
      </div>

      {err && <div className="sm:col-span-2 text-red-600 text-sm">{err}</div>}

      <div className="sm:col-span-2 flex gap-2 justify-end">
        {editing && (
          <button type="button" onClick={onDelete}
            className="px-3 py-1.5 text-sm text-red-600 hover:underline">
            ลบ
          </button>
        )}
        <button type="button" onClick={() => router.push("/")}
          className="px-3 py-1.5 text-sm border rounded">
          ยกเลิก
        </button>
        <button disabled={busy} className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded">
          {busy ? "..." : editing ? "บันทึก" : "สร้าง"}
        </button>
      </div>
    </form>
  );
}
