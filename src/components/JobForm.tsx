"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUSES, STATUS_LABEL, DELIVERY_OPTIONS, type Status } from "@/lib/eta";

type User = { id: string; name: string; username: string };
type MaterialOpt = { id: string; name: string; unit: string; code: string | null };
type MatRow = { materialId: string; qtyPerUnit: number };
type ProductOpt = { id: string; name: string; code: string | null; materials: MatRow[] };

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
  materials?: { materialId: string; qtyPerUnit: number }[];
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
}: {
  users: User[];
  salesUsers?: User[];
  allMaterials?: MaterialOpt[];
  products?: ProductOpt[];
  initial?: Initial;
  // SUPPORT can't set status/ETA (server forces PENDING / null) — hide those fields.
  canSetStatus?: boolean;
}) {
  const router = useRouter();
  const editing = !!initial?.id;
  const [mats, setMats] = useState<MatRow[]>(initial?.materials ?? []);
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
        .map((m) => ({ materialId: m.materialId, qtyPerUnit: Number(m.qtyPerUnit) })),
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
    // Prefill the produced item with the model name and copy its recipe as the BOM.
    setF((prev) => ({ ...prev, item: p.code || p.name }));
    setMats(p.materials.map((m) => ({ materialId: m.materialId, qtyPerUnit: m.qtyPerUnit })));
  }
  function unitOf(id: string) {
    return allMaterials.find((m) => m.id === id)?.unit ?? "";
  }
  function addMat() {
    setMats([...mats, { materialId: "", qtyPerUnit: 1 }]);
  }
  function updateMat(i: number, patch: Partial<MatRow>) {
    setMats(mats.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function removeMat(i: number) {
    setMats(mats.filter((_, idx) => idx !== i));
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

      {canSetStatus && (
        <div className="sm:col-span-2">
          <div className={label}>ETA Manual (กำหนดเอง)</div>
          <input type="date" className={input} value={f.etaManual}
            onChange={(e) => setF({ ...f, etaManual: e.target.value })} />
        </div>
      )}

      {/* Bill of materials */}
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
        <div className="flex items-center justify-between mb-1">
          <div className={label}>วัสดุที่ใช้ (ต่อ 1 ชิ้น) — ตัดสต๊อกทันทีเมื่อบันทึกงาน</div>
          {allMaterials.length > 0 && (
            <button type="button" onClick={addMat}
              className="text-xs text-blue-600 hover:underline whitespace-nowrap">+ เพิ่มวัสดุ</button>
          )}
        </div>
        {allMaterials.length === 0 ? (
          <div className="text-xs text-gray-400">ยังไม่มีวัสดุในสต๊อก — เพิ่มที่หน้า “สต๊อกวัสดุ” ก่อน</div>
        ) : mats.length === 0 ? (
          <div className="text-xs text-gray-400">ยังไม่ได้ระบุวัสดุ</div>
        ) : (
          <div className="space-y-2">
            {mats.map((m, i) => (
              <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                <select className={input + " flex-1 basis-full sm:basis-0 min-w-[11rem]"} value={m.materialId}
                  onChange={(e) => updateMat(i, { materialId: e.target.value })}>
                  <option value="">- เลือกวัสดุ -</option>
                  {allMaterials.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.code ? `[${opt.code}] ` : ""}{opt.name}
                    </option>
                  ))}
                </select>
                <input type="number" min={0} step="any" className={input + " w-20 text-center shrink-0"}
                  value={m.qtyPerUnit}
                  onChange={(e) => updateMat(i, { qtyPerUnit: Number(e.target.value) })} />
                <span className="text-xs text-gray-500 w-10 shrink-0">{unitOf(m.materialId)}</span>
                <button type="button" onClick={() => removeMat(i)}
                  className="text-red-600 text-sm px-2 shrink-0">✕</button>
              </div>
            ))}
            <div className="text-xs text-gray-400">
              ตัดจริง = จำนวนต่อชิ้น × จำนวนผลิต ({Number(f.qty) || 0} ชิ้น)
            </div>
          </div>
        )}
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
