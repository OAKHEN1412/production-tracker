"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { MATERIAL_CATEGORIES, MATERIAL_UNITS } from "@/lib/materials";

// Map header (Thai/English, case/space-insensitive) → internal field.
const HEADER_MAP: Record<string, string> = {
  "รหัส": "code",
  "รหัส / part no.": "code",
  "part no": "code",
  "part no.": "code",
  "partno": "code",
  "code": "code",
  "sku": "code",
  "ชื่อวัสดุ": "name",
  "ชื่อ": "name",
  "name": "name",
  "product name": "name",
  "รายการ": "name",
  "หมวด": "category",
  "หมวดหมู่": "category",
  "category": "category",
  "หน่วย": "unit",
  "unit": "unit",
  "คงเหลือ": "qty",
  "จำนวน": "qty",
  "qty": "qty",
  "stock": "qty",
  "ขั้นต่ำ": "minQty",
  "ขั้นต่ำ (แจ้งเตือน)": "minQty",
  "min": "minQty",
  "minqty": "minQty",
  "ที่เก็บ": "location",
  "location": "location",
  "หมายเหตุ": "notes",
  "note": "notes",
  "notes": "notes",
};

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/\s+/g, " ");
}

type Row = {
  code?: string;
  name?: string;
  category?: string;
  unit?: string;
  qty?: number;
  minQty?: number;
  location?: string;
  notes?: string;
};

export default function UploadMaterialsExcel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ["รหัส", "ชื่อวัสดุ", "หมวด", "หน่วย", "คงเหลือ", "ขั้นต่ำ", "ที่เก็บ", "หมายเหตุ"],
      ["0L2B040.0-2.5Y", "TUBE MCQA/QV2-40 (230cm/pc)", MATERIAL_CATEGORIES[0], MATERIAL_UNITS[1], 0, 8, "", ""],
      ["", "ROD-20 (153cm/pc)", "แกน/ก้านสูบ", MATERIAL_UNITS[1], 20, 26, "", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materials");
    XLSX.writeFile(wb, "template-materials.xlsx");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

    const parsed: Row[] = raw.map((r) => {
      const row: any = {};
      for (const k of Object.keys(r)) {
        const mapped = HEADER_MAP[normalizeKey(k)];
        if (mapped && row[mapped] === undefined) row[mapped] = r[k];
      }
      if (row.name != null) row.name = String(row.name).trim();
      if (row.code != null) row.code = String(row.code).trim();
      if (row.qty != null && row.qty !== "") row.qty = Number(row.qty);
      if (row.minQty != null && row.minQty !== "") row.minQty = Number(row.minQty);
      return row as Row;
    }).filter((r) => r.name); // drop empty rows

    setRows(parsed);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function commit() {
    if (rows.length === 0) return;
    setBusy(true);
    const res = await fetch("/api/materials/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    setBusy(false);
    const j = await res.json();
    if (!res.ok) {
      setResult("error: " + JSON.stringify(j.error));
      return;
    }
    setResult(
      `เพิ่ม ${j.createdCount} รายการ / ข้าม ${j.errorCount}` +
        (j.errorCount ? "\n" + j.errors.map((e: any) => `แถว ${e.row}: ${e.error}`).join("\n") : "")
    );
    if (j.createdCount > 0) {
      setRows([]);
      router.refresh();
    }
  }

  return (
    <div className="inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded whitespace-nowrap"
      >
        {open ? "✕ ปิด" : "⬆ อัปโหลด Excel"}
      </button>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-start justify-center p-4 overflow-auto"
          onClick={() => setOpen(false)}>
          <div className="bg-white rounded shadow-lg max-w-4xl w-full p-4 mt-10"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-lg">อัปโหลดวัสดุ (Excel)</h2>
              <button onClick={() => setOpen(false)} className="text-gray-500">✕</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={downloadTemplate} className="text-sm px-3 py-1.5 border rounded">
                ⬇ ดาวน์โหลด template
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="text-sm" />
            </div>

            <div className="text-xs text-gray-600 mb-2">
              คอลัมน์: <b>รหัส, ชื่อวัสดุ</b>, หมวด, หน่วย, คงเหลือ, ขั้นต่ำ, ที่เก็บ, หมายเหตุ — มีแค่ "ชื่อวัสดุ" ก็พอ ที่เหลือเติม default<br />
              รายการที่ <b>รหัสหรือชื่อซ้ำ</b> ของเดิมจะถูกข้าม (อัปซ้ำได้ เพิ่มเฉพาะของใหม่)
            </div>

            {rows.length > 0 && (
              <>
                <div className="overflow-x-auto max-h-96 border rounded">
                  <table className="data-table text-xs">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>รหัส</th>
                        <th>ชื่อวัสดุ</th>
                        <th>หมวด</th>
                        <th>หน่วย</th>
                        <th>คงเหลือ</th>
                        <th>ขั้นต่ำ</th>
                        <th>ที่เก็บ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td className="font-mono">{r.code}</td>
                          <td>{r.name}</td>
                          <td>{r.category}</td>
                          <td>{r.unit}</td>
                          <td className="text-center">{r.qty ?? ""}</td>
                          <td className="text-center">{r.minQty ?? ""}</td>
                          <td>{r.location}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => setRows([])} className="px-3 py-1.5 text-sm border rounded">ล้าง</button>
                  <button onClick={commit} disabled={busy}
                    className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
                    {busy ? "กำลังบันทึก..." : `ยืนยันเพิ่ม (${rows.length} รายการ)`}
                  </button>
                </div>
              </>
            )}

            {result && (
              <pre className="mt-3 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded border">{result}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
