"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import BomEditor, { type MatRow } from "./BomEditor";

type User = { id: string; name: string; username: string };
type MaterialOpt = { id: string; name: string; unit: string; code: string | null };
type ProductOpt = { id: string; name: string; code: string | null; materials: MatRow[] };

type Job = {
  id: string;
  seq: number;
  docNo: string;
  orderDate: string | Date;
  customer: string;
  item: string;
  qty: number;
  notes: string | null;
  salesOwner: { name: string } | null;
  createdBy: { name: string } | null;
};

function fmtDate(d?: string | Date | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("th-TH", { year: "2-digit", month: "2-digit", day: "2-digit" });
}

export default function ApprovalsView({
  jobs,
  users,
  allMaterials,
  products,
}: {
  jobs: Job[];
  users: User[];
  allMaterials: MaterialOpt[];
  products: ProductOpt[];
}) {
  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded shadow p-8 text-center text-gray-500 text-sm">
        ไม่มีคำขอรออนุมัติ 🎉
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {jobs.map((j) => (
        <RequestCard key={j.id} job={j} users={users} allMaterials={allMaterials} products={products} />
      ))}
    </div>
  );
}

function RequestCard({
  job,
  users,
  allMaterials,
  products,
}: {
  job: Job;
  users: User[];
  allMaterials: MaterialOpt[];
  products: ProductOpt[];
}) {
  const router = useRouter();
  const [item, setItem] = useState(job.item);
  const [qty, setQty] = useState(job.qty);
  const [assignedToId, setAssignedToId] = useState("");
  const [mats, setMats] = useState<MatRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function applyProduct(id: string) {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setItem(p.code || p.name);
    setMats(p.materials.map((m) => ({ materialId: m.materialId, qtyPerUnit: m.qtyPerUnit, cutLengthMm: m.cutLengthMm ?? 0 })));
  }

  async function patch(body: any) {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : JSON.stringify(j.error));
      return;
    }
    router.refresh();
  }

  function approve() {
    const cleanMats = mats
      .filter((m) => m.materialId && Number(m.qtyPerUnit) > 0)
      .map((m) => ({ materialId: m.materialId, qtyPerUnit: Number(m.qtyPerUnit), cutLengthMm: Number(m.cutLengthMm) || 0 }));
    // Approve = set worker + BOM and put the job into the production queue
    // (PENDING / รอผลิต); stock is deducted and ETA computed on save.
    patch({
      status: "PENDING",
      item,
      qty: Number(qty),
      assignedToId: assignedToId || null,
      materials: cleanMats,
    });
  }
  function reject() {
    if (!confirm("ไม่อนุมัติคำขอนี้? (ยกเลิกงาน)")) return;
    patch({ status: "CANCELLED", cancelled: true });
  }

  const inp = "border rounded px-2 py-1.5 w-full text-sm";
  const lbl = "text-xs text-gray-600";

  return (
    <div className="bg-white rounded shadow p-4 border-l-4 border-amber-400">
      {/* Request summary */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono">#{job.seq}</span>
            <span className="font-mono text-xs">{job.docNo}</span>
          </div>
          <div className="font-semibold text-sm">{job.customer}</div>
        </div>
        <div className="text-xs text-gray-500 text-right">
          <div>ผู้ขอ: <b className="text-gray-700">{job.createdBy?.name ?? "-"}</b></div>
          <div>เซล: {job.salesOwner?.name ?? "-"}</div>
          <div>สั่งผลิต: {fmtDate(job.orderDate)}</div>
        </div>
      </div>
      {job.notes && <div className="text-xs text-gray-600 italic mb-3">หมายเหตุ: {job.notes}</div>}

      {/* PRODUCTION fills these in */}
      {products.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-3">
          <div className={lbl}>เลือกรุ่นกระบอก (เติมรายการ + วัสดุอัตโนมัติ)</div>
          <select className={inp} defaultValue="" onChange={(e) => applyProduct(e.target.value)}>
            <option value="">- ไม่เลือก (กรอกเอง) -</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.code ? `[${p.code}] ` : ""}{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div className="sm:col-span-1">
          <div className={lbl}>รายการผลิต</div>
          <input className={inp} value={item} onChange={(e) => setItem(e.target.value)} />
        </div>
        <div>
          <div className={lbl}>จำนวน</div>
          <input type="number" min={1} className={inp} value={qty}
            onChange={(e) => setQty(Number(e.target.value))} />
        </div>
        <div>
          <div className={lbl}>เลือกช่าง</div>
          <select className={inp} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">- ยังไม่กำหนด -</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* Bill of materials */}
      <div className="border-t pt-2">
        <BomEditor value={mats} onChange={setMats} allMaterials={allMaterials}
          label="วัสดุที่ใช้ (ต่อ 1 ชิ้น) — ตัดสต๊อกเมื่ออนุมัติ"
          hint={`ตัดจริง × ${Number(qty) || 0} ชิ้น · วัสดุเส้น = ความยาวตัด/หน่วย`} />
      </div>

      {err && <div className="text-red-600 text-sm mt-2">{err}</div>}

      <div className="flex gap-2 justify-end mt-3 pt-2 border-t">
        <button onClick={reject} disabled={busy}
          className="px-3 py-1.5 text-sm text-red-600 hover:underline disabled:opacity-50">
          ✕ ไม่อนุมัติ
        </button>
        <button onClick={approve} disabled={busy}
          className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50">
          {busy ? "..." : "✓ อนุมัติ & สั่งงาน"}
        </button>
      </div>
    </div>
  );
}
