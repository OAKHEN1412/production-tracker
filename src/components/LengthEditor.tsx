"use client";
import { useState } from "react";
import type { MaterialLengthRow } from "@/lib/materials";

type Row = { lengthMm: number | string; qty: number | string };

// Edit the per-length stock breakdown of a length-tracked material as a table
// (add / edit / delete จำนวนเส้น at each ความยาว). Saves the whole list; these
// buckets are exactly what recipe/approval cutting deducts from.
export default function LengthEditor({
  material,
  onClose,
  onSaved,
}: {
  material: { id: string; name: string; unit: string; lengths?: MaterialLengthRow[] };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(
    (material.lengths && material.lengths.length > 0
      ? [...material.lengths].sort((a, b) => b.lengthMm - a.lengthMm)
      : [{ lengthMm: 0, qty: 0 }]
    ).map((l) => ({ lengthMm: l.lengthMm || "", qty: l.qty }))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const add = () => setRows([...rows, { lengthMm: "", qty: 1 }]);
  const upd = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const rm = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  const totalPieces = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
  const totalM = rows.reduce((s, r) => s + (Number(r.lengthMm) || 0) * (Number(r.qty) || 0), 0) / 1000;

  async function save() {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/materials/${material.id}/lengths`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lengths: rows.map((r) => ({ lengthMm: Number(r.lengthMm) || 0, qty: Number(r.qty) || 0 })),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(typeof j.error === "string" ? j.error : "บันทึกไม่ได้");
      return;
    }
    onSaved();
    onClose();
  }

  const inp = "border rounded px-2 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-base">📏 ความยาวสต๊อก — {material.name}</h2>
        <p className="text-xs text-gray-500 mb-3">
          จำนวนเส้นต่อความยาว (mm) — ใช้ตัดตามรุ่นกระบอก/อนุมัติ. 0 = ไม่ระบุความยาว.
        </p>

        <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center text-xs text-gray-500 mb-1">
          <span>ความยาว/เส้น (mm)</span>
          <span className="w-20 text-center">จำนวนเส้น</span>
          <span className="w-6"></span>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
              <input type="number" min={0} step="any" placeholder="เช่น 6000"
                className={inp + " w-full"} value={r.lengthMm}
                onChange={(e) => upd(i, { lengthMm: e.target.value })} />
              <input type="number" min={0} step={1} className={inp + " w-20 text-center"} value={r.qty}
                onChange={(e) => upd(i, { qty: e.target.value })} />
              <button type="button" onClick={() => rm(i)} className="text-red-600 text-sm px-1 w-6">✕</button>
            </div>
          ))}
        </div>

        <button type="button" onClick={add} className="mt-2 text-xs text-blue-600 hover:underline">
          + เพิ่มความยาว
        </button>

        <div className="text-sm text-gray-600 mt-3 border-t pt-2">
          รวม <b>{totalPieces}</b> เส้น · <b>{totalM.toFixed(2)}</b> ม.
        </div>

        {err && <div className="text-red-600 text-sm mt-2">{err}</div>}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-1.5 text-sm border rounded">ยกเลิก</button>
          <button onClick={save} disabled={busy}
            className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50">
            {busy ? "..." : "✓ บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
