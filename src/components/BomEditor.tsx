"use client";
import { isLengthTracked } from "@/lib/materials";

export type MatRow = { materialId: string; qtyPerUnit: number; cutLengthMm?: number };
type MaterialOpt = { id: string; name: string; unit: string; code: string | null };

// Shared bill-of-materials editor used by the products recipe, the job form and
// the approval form. One place owns the length-vs-count input split so the cut
// length can't silently get dropped in one of the copies.
export default function BomEditor({
  value,
  onChange,
  allMaterials,
  label,
  hint,
}: {
  value: MatRow[];
  onChange: (rows: MatRow[]) => void;
  allMaterials: MaterialOpt[];
  label: string;
  hint?: React.ReactNode;
}) {
  const inp = "border rounded px-2 py-1.5 w-full text-sm";
  // Fixed-width number inputs must NOT carry w-full (it overrides the w-20/w-24).
  const numInp = "border rounded px-2 py-1.5 text-sm text-center shrink-0";
  const unitOf = (id: string) => allMaterials.find((m) => m.id === id)?.unit ?? "";
  const add = () => onChange([...value, { materialId: "", qtyPerUnit: 1, cutLengthMm: 0 }]);
  const upd = (i: number, patch: Partial<MatRow>) =>
    onChange(value.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const rm = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-gray-600">{label}</div>
        {allMaterials.length > 0 && (
          <button type="button" onClick={add}
            className="text-xs text-blue-600 hover:underline whitespace-nowrap">+ เพิ่มวัสดุ</button>
        )}
      </div>
      {allMaterials.length === 0 ? (
        <div className="text-xs text-gray-400">ยังไม่มีวัสดุในสต๊อก — เพิ่มที่หน้า “สต๊อกวัสดุ” ก่อน</div>
      ) : value.length === 0 ? (
        <div className="text-xs text-gray-400">ยังไม่ได้ระบุวัสดุ</div>
      ) : (
        <div className="space-y-2">
          {value.map((m, i) => {
            const lenTracked = isLengthTracked(unitOf(m.materialId));
            return (
              <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                <select className={inp + " flex-1 basis-full sm:basis-0 min-w-[11rem]"} value={m.materialId}
                  onChange={(e) => upd(i, { materialId: e.target.value, qtyPerUnit: 1, cutLengthMm: 0 })}>
                  <option value="">- เลือกวัสดุ -</option>
                  {allMaterials.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.code ? `[${opt.code}] ` : ""}{opt.name}</option>
                  ))}
                </select>
                {lenTracked ? (
                  <>
                    <input type="number" min={0} step="any" placeholder="ยาว/หน่วย"
                      className={numInp + " w-24"} value={m.cutLengthMm || ""}
                      onChange={(e) => upd(i, { qtyPerUnit: 1, cutLengthMm: Number(e.target.value) })} />
                    <span className="text-xs text-gray-500 w-12 shrink-0">mm/ตัว</span>
                  </>
                ) : (
                  <>
                    <input type="number" min={0} step="any" className={numInp + " w-20"} value={m.qtyPerUnit}
                      onChange={(e) => upd(i, { qtyPerUnit: Number(e.target.value) })} />
                    <span className="text-xs text-gray-500 w-10 shrink-0">{unitOf(m.materialId)}</span>
                  </>
                )}
                <button type="button" onClick={() => rm(i)} className="text-red-600 text-sm px-2 shrink-0">✕</button>
              </div>
            );
          })}
          {hint && <div className="text-xs text-gray-400">{hint}</div>}
        </div>
      )}
    </div>
  );
}
