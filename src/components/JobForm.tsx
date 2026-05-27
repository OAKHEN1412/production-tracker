"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUSES, STATUS_LABEL, DELIVERY_OPTIONS, type Status } from "@/lib/eta";
import BomEditor, { type MatRow } from "./BomEditor";

type User = { id: string; name: string; username: string };
type MaterialOpt = { id: string; name: string; unit: string; code: string | null };
type AsmRow = { name: string; qty: number };
type ProductOpt = { id: string; name: string; code: string | null; materials: MatRow[]; assemblies?: AsmRow[] };

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
  salesOwnerId?: string | null;
  status?: Status;
  materials?: MatRow[];
};

function toDateInput(d?: string | Date | null) {
  if (!d) return "";
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function JobForm({
  users,
  salesUsers = [],
  allMaterials = [],
  products = [],
  initial,
  canSetStatus = true,
  canSetEta,
}: {
  users: User[];
  salesUsers?: User[];
  allMaterials?: MaterialOpt[];
  products?: ProductOpt[];
  initial?: Initial;
  // SUPPORT can't set status/worker/BOM (server forces PENDING / null) — hide those.
  canSetStatus?: boolean;
  // ETA is separate: SUPPORT may request a target date. Defaults to canSetStatus.
  canSetEta?: boolean;
}) {
  const showEta = canSetEta ?? canSetStatus;
  const router = useRouter();
  const editing = !!initial?.id;
  const [mats, setMats] = useState<MatRow[]>(initial?.materials ?? []);
  const [asms, setAsms] = useState<AsmRow[]>([]);
  const [productId, setProductId] = useState("");

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
    salesOwnerId: initial?.salesOwnerId ?? "",
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
      salesOwnerId: f.salesOwnerId || null,
      materials: mats
        .filter((m) => m.materialId && Number(m.qtyPerUnit) > 0)
        .map((m) => ({ materialId: m.materialId, qtyPerUnit: Number(m.qtyPerUnit), cutLengthMm: Number(m.cutLengthMm) || 0 })),
      // Only send assemblies when a model was picked this session, so editing a job
      // without re-selecting a model doesn't wipe its existing assembly list.
      ...(productId ? { assemblies: asms.filter((a) => a.name.trim() && Number(a.qty) > 0) } : {}),
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

  function applyProduct(id: string) {
    setProductId(id);
    if (!id) return;
    const p = products.find((x) => x.id === id);
    if (!p) return;
    // Prefill the produced item with the model name and copy its recipe as the BOM
    // + its assembly list (the shipping parts list).
    setF((prev) => ({ ...prev, item: p.code || p.name }));
    setMats(p.materials.map((m) => ({ materialId: m.materialId, qtyPerUnit: m.qtyPerUnit, cutLengthMm: m.cutLengthMm ?? 0 })));
    setAsms((p.assemblies ?? []).map((a) => ({ name: a.name, qty: a.qty })));
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
        <div className={label}>รายการผลิต *</div>
        <input className={input} required value={f.item}
          onChange={(e) => setF({ ...f, item: e.target.value })} />
      </div>
      <div>
        <div className={label}>จำนวนที่ผลิต *</div>
        <input type="number" min={1} className={input} required value={f.qty}
          onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} />
      </div>

      {canSetStatus && (
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
      )}
      <div>
        <div className={label}>งานของเซล</div>
        <select className={input} value={f.salesOwnerId}
          onChange={(e) => setF({ ...f, salesOwnerId: e.target.value })}>
          <option value="">- ไม่ระบุ -</option>
          {salesUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
          ))}
        </select>
      </div>
      {canSetStatus && (
        <div>
          <div className={label}>สถานะ</div>
          <select className={input} value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value as Status })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      )}

      {/* SUPPORT requests a delivery window (label); PRODUCTION's is auto from the queue. */}
      {!canSetStatus && (
        <div>
          <div className={label}>ช่วงเวลาส่ง (ขอ)</div>
          <select className={input} value={f.deliveryTime}
            onChange={(e) => setF({ ...f, deliveryTime: e.target.value })}>
            {DELIVERY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}
      {showEta && (
        <div className={canSetStatus ? "sm:col-span-2" : ""}>
          <div className={label}>{canSetStatus ? "ETA Manual (กำหนดเอง)" : "วันที่ต้องการ (เจาะจง)"}</div>
          <input type="date" className={input} value={f.etaManual}
            onChange={(e) => setF({ ...f, etaManual: e.target.value })} />
        </div>
      )}

      {/* Bill of materials — PRODUCTION-only; SUPPORT requests get their BOM at approval */}
      {canSetStatus && (
      <div className="sm:col-span-2 border-t pt-3">
        {products.length > 0 && (
          <div className="mb-3 bg-blue-50 border border-blue-200 rounded p-2">
            <div className={label}>เลือกรุ่นกระบอก (เติมรายการ + วัสดุให้อัตโนมัติ)</div>
            <select className={input} value={productId} onChange={(e) => applyProduct(e.target.value)}>
              <option value="">- เลือกรุ่น (ไม่บังคับ) -</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code ? `[${p.code}] ` : ""}{p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <BomEditor value={mats} onChange={setMats} allMaterials={allMaterials}
          label="วัสดุที่ใช้ (ต่อ 1 ชิ้น) — ตัดสต๊อกทันทีเมื่อบันทึกงาน"
          hint={`ตัดจริง = ต่อชิ้น × จำนวนผลิต (${Number(f.qty) || 0} ชิ้น) · วัสดุเส้น = จำนวนเส้น × ความยาวตัด/ตัว`} />
      </div>
      )}

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
