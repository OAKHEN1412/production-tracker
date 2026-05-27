"use client";

export type AsmRow = { name: string; qty: number };

// Editor for a cylinder model's assembly list (ชุดประกอบ): each row = ชื่อชุด + จำนวน.
// Separate from the material BOM — this is the physical-parts list SHIPPING brings.
export default function AssemblyEditor({
  value,
  onChange,
  label = "ชุดประกอบ (รายการของที่ส่งให้ฝ่ายจัดส่ง)",
  hint,
}: {
  value: AsmRow[];
  onChange: (rows: AsmRow[]) => void;
  label?: string;
  hint?: React.ReactNode;
}) {
  const inp = "border rounded px-2 py-1.5 text-sm";
  const add = () => onChange([...value, { name: "", qty: 1 }]);
  const upd = (i: number, patch: Partial<AsmRow>) =>
    onChange(value.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const rm = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-gray-600">{label}</div>
        <button type="button" onClick={add}
          className="text-xs text-blue-600 hover:underline whitespace-nowrap">+ เพิ่มชุดประกอบ</button>
      </div>
      {value.length === 0 ? (
        <div className="text-xs text-gray-400">ยังไม่ได้ระบุชุดประกอบ</div>
      ) : (
        <div className="space-y-2">
          {value.map((m, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input className={inp + " flex-1 min-w-0"} placeholder="ชื่อชุด เช่น ชุดฝาหน้า"
                value={m.name} onChange={(e) => upd(i, { name: e.target.value })} />
              <input type="number" min={1} step="1" className={inp + " w-20 text-center shrink-0"}
                value={m.qty || ""} placeholder="จำนวน"
                onChange={(e) => upd(i, { qty: Number(e.target.value) })} />
              <span className="text-xs text-gray-500 shrink-0">ชุด/ตัว</span>
              <button type="button" onClick={() => rm(i)} className="text-red-600 text-sm px-2 shrink-0">✕</button>
            </div>
          ))}
          {hint && <div className="text-xs text-gray-400">{hint}</div>}
        </div>
      )}
    </div>
  );
}
