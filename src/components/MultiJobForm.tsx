"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type User = { id: string; name: string; username: string };
type Row = { docNo: string; customer: string; item: string; qty: number };

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function emptyRow(): Row {
  return { docNo: "", customer: "", item: "", qty: 1 };
}

// Create many work orders at once: each row becomes its own job (separate seq /
// production item). Shared order date + sales owner apply to every row. Posts to
// /api/jobs/bulk. SUPPORT rows land as WAITING_APPROVAL (server-enforced).
export default function MultiJobForm({
  salesUsers = [],
  isSupport = false,
  onClose,
}: {
  salesUsers?: User[];
  isSupport?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [orderDate, setOrderDate] = useState(todayInput());
  const [salesOwnerId, setSalesOwnerId] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [busy, setBusy] = useState(false);

  const upd = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows([...rows, emptyRow()]);
  const rmRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  const valid = rows.filter((r) => r.item.trim() && Number(r.qty) > 0);

  async function submit() {
    if (valid.length === 0) {
      alert("ใส่อย่างน้อย 1 แถว (ต้องมีรายการ + จำนวน)");
      return;
    }
    setBusy(true);
    const payloadRows = valid.map((r) => ({
      docNo: r.docNo.trim(),
      customer: r.customer.trim() || "-",
      item: r.item.trim(),
      qty: Number(r.qty),
      orderDate,
      salesOwnerId: salesOwnerId || null,
    }));
    const res = await fetch("/api/jobs/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: payloadRows }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert("สร้างไม่ได้: " + (typeof j.error === "string" ? j.error : JSON.stringify(j.error)));
      return;
    }
    const j = await res.json();
    if (j.errorCount > 0) {
      alert(`สร้าง ${j.createdCount} งาน, ผิดพลาด ${j.errorCount} แถว:\n` +
        (j.errors ?? []).map((e: any) => `แถว ${e.row}: ${e.error}`).join("\n"));
    } else {
      alert(`สร้าง ${j.createdCount} งานสำเร็จ`);
    }
    onClose();
    router.refresh();
  }

  const inp = "border rounded px-2 py-1.5 text-sm w-full";
  const lbl = "text-xs text-gray-600";

  return (
    <div className="bg-white p-4 rounded shadow border-2 border-indigo-400 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">+ สั่งงานหลายรายการ (แต่ละแถว = 1 งานแยกกัน)</div>
        {isSupport && <span className="text-xs text-amber-700">SUPPORT: ทุกแถวเป็นคำขอรออนุมัติ</span>}
      </div>

      {/* Shared fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className={lbl}>วันที่สั่งผลิต (ใช้กับทุกแถว)</div>
          <input type="date" className={inp} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        {salesUsers.length > 0 && (
          <div>
            <div className={lbl}>งานของเซล (ใช้กับทุกแถว)</div>
            <select className={inp} value={salesOwnerId} onChange={(e) => setSalesOwnerId(e.target.value)}>
              <option value="">- ไม่ระบุ -</option>
              {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Rows */}
      <div className="space-y-2">
        <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-gray-500 px-1">
          <div className="col-span-3">เลขที่เอกสาร</div>
          <div className="col-span-4">ลูกค้า</div>
          <div className="col-span-3">รายการผลิต *</div>
          <div className="col-span-1 text-center">จำนวน *</div>
          <div className="col-span-1"></div>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input className={inp + " col-span-6 sm:col-span-3"} placeholder="เลขที่เอกสาร" value={r.docNo}
              onChange={(e) => upd(i, { docNo: e.target.value })} />
            <input className={inp + " col-span-6 sm:col-span-4"} placeholder="ลูกค้า" value={r.customer}
              onChange={(e) => upd(i, { customer: e.target.value })} />
            <input className={inp + " col-span-7 sm:col-span-3"} placeholder="รายการผลิต *" value={r.item}
              onChange={(e) => upd(i, { item: e.target.value })} />
            <input type="number" min={1} className={inp + " col-span-3 sm:col-span-1 text-center"} value={r.qty}
              onChange={(e) => upd(i, { qty: Number(e.target.value) })} />
            <button type="button" onClick={() => rmRow(i)}
              className="col-span-2 sm:col-span-1 text-red-600 text-sm hover:underline">✕</button>
          </div>
        ))}
        <button type="button" onClick={addRow} className="text-xs text-blue-600 hover:underline">+ เพิ่มแถว</button>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t">
        <button onClick={onClose} className="px-4 py-1.5 text-sm border rounded">ยกเลิก</button>
        <button onClick={submit} disabled={busy || valid.length === 0}
          className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50">
          {busy ? "กำลังสร้าง..." : `สร้าง ${valid.length} งาน`}
        </button>
      </div>
    </div>
  );
}
