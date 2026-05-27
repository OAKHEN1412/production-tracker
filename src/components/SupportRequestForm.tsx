"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DELIVERY_OPTIONS } from "@/lib/eta";

type User = { id: string; name: string; username: string };
type Item = { item: string; qty: number };

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// SUPPORT request form: one shared header (doc/customer/date/sales/ETA/notes) +
// many production line items (รายการ + จำนวน). Each line becomes its own request
// (WAITING_APPROVAL) sharing the header — "ข้อมูลเดียว แยกรายการ".
export default function SupportRequestForm({
  salesUsers = [],
  onClose,
}: {
  salesUsers?: User[];
  // Dashboard passes a panel-close; /jobs/new omits it → navigate home after submit.
  onClose?: () => void;
}) {
  const router = useRouter();
  const close = () => (onClose ? onClose() : router.push("/"));
  const [docNo, setDocNo] = useState("");
  const [orderDate, setOrderDate] = useState(todayInput());
  const [customer, setCustomer] = useState("");
  const [salesOwnerId, setSalesOwnerId] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("3-5 วันทำการ");
  const [etaManual, setEtaManual] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([{ item: "", qty: 1 }]);
  const [busy, setBusy] = useState(false);

  const updItem = (i: number, patch: Partial<Item>) =>
    setItems(items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addItem = () => setItems([...items, { item: "", qty: 1 }]);
  const rmItem = (i: number) => setItems(items.length > 1 ? items.filter((_, idx) => idx !== i) : items);

  const validItems = items.filter((it) => it.item.trim() && Number(it.qty) > 0);

  async function submit() {
    if (!docNo.trim() || !customer.trim()) { alert("กรอกเลขที่เอกสาร + ลูกค้า"); return; }
    if (validItems.length === 0) { alert("ใส่อย่างน้อย 1 รายการ (รายการผลิต + จำนวน)"); return; }
    setBusy(true);
    let created = 0;
    const errs: string[] = [];
    for (let i = 0; i < validItems.length; i++) {
      const it = validItems[i];
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docNo: docNo.trim(), orderDate, customer: customer.trim(),
          item: it.item.trim(), qty: Number(it.qty),
          notes: notes.trim() || null, salesOwnerId: salesOwnerId || null,
          deliveryTime, etaManual: etaManual || null,
        }),
      });
      if (res.ok) created++;
      else {
        const j = await res.json().catch(() => ({}));
        errs.push(`${it.item}: ${typeof j.error === "string" ? j.error : JSON.stringify(j.error)}`);
      }
    }
    setBusy(false);
    if (errs.length) alert("บางรายการส่งไม่ได้:\n" + errs.join("\n"));
    if (created) {
      alert(`ส่งคำขอ ${created} รายการ (รออนุมัติ)`);
      close();
      router.refresh();
    }
  }

  const inp = "border rounded px-2 py-1.5 text-sm w-full";
  // Row inputs must NOT carry w-full (it beats the fixed/flex widths → overflow).
  const inpRow = "border rounded px-2 py-1.5 text-sm";
  const lbl = "text-xs text-gray-600";

  return (
    <div className="bg-white p-4 rounded shadow border-2 border-green-400 space-y-3">
      <div className="font-semibold text-sm">+ ส่งคำขอผลิต (กรอกข้อมูลร่วมครั้งเดียว + หลายรายการ)</div>

      {/* Shared header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className={lbl}>เลขที่เอกสาร *</div>
          <input className={inp} value={docNo} onChange={(e) => setDocNo(e.target.value)} />
        </div>
        <div>
          <div className={lbl}>วันที่สั่งผลิต *</div>
          <input type="date" className={inp} value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </div>
        <div>
          <div className={lbl}>ผลิตให้กับ บ. *</div>
          <input className={inp} value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </div>
        <div>
          <div className={lbl}>งานของเซล</div>
          <select className={inp} value={salesOwnerId} onChange={(e) => setSalesOwnerId(e.target.value)}>
            <option value="">- ไม่ระบุ -</option>
            {salesUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <div className={lbl}>ช่วงเวลาส่ง (ขอ)</div>
          <select className={inp} value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)}>
            {DELIVERY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <div className={lbl}>วันที่ต้องการ (เจาะจง)</div>
          <input type="date" className={inp} value={etaManual} onChange={(e) => setEtaManual(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <div className={lbl}>หมายเหตุ</div>
          <input className={inp} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Line items: item + qty only */}
      <div className="border-t pt-2">
        <div className="text-xs font-semibold text-gray-600 mb-1">รายการผลิต (แยกเป็นคำขอละรายการ)</div>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input className={inpRow + " flex-1 min-w-0"} placeholder="รายการผลิต *"
                value={it.item} onChange={(e) => updItem(i, { item: e.target.value })} />
              <input type="number" min={1} className={inpRow + " w-16 text-center shrink-0"}
                value={it.qty} onChange={(e) => updItem(i, { qty: Number(e.target.value) })} />
              <span className="text-xs text-gray-500 shrink-0">ชิ้น</span>
              <button type="button" onClick={() => rmItem(i)} className="text-red-600 text-sm px-2 shrink-0">✕</button>
            </div>
          ))}
          <button type="button" onClick={addItem} className="text-xs text-blue-600 hover:underline">+ เพิ่มรายการ</button>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t">
        <button onClick={close} className="px-4 py-1.5 text-sm border rounded">ยกเลิก</button>
        <button onClick={submit} disabled={busy || validItems.length === 0}
          className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50">
          {busy ? "กำลังส่ง..." : `ส่งคำขอ ${validItems.length} รายการ`}
        </button>
      </div>
    </div>
  );
}
