"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { STATUSES, STATUS_LABEL, type Status } from "@/lib/eta";

// Map Thai header → internal field
const HEADER_MAP: Record<string, string> = {
  "เลขที่เอกสาร": "docNo",
  "docno": "docNo",
  "วันที่สั่งผลิต": "orderDate",
  "วันสั่งผลิต": "orderDate",
  "orderdate": "orderDate",
  "delivery time": "deliveryTime",
  "deliverytime": "deliveryTime",
  "delivery": "deliveryTime",
  "ลูกค้า": "customer",
  "ผลิตให้กับ บ.": "customer",
  "customer": "customer",
  "รายการ": "item",
  "รายการผลิต": "item",
  "item": "item",
  "จำนวน": "qty",
  "จำนวนที่ผลิต": "qty",
  "qty": "qty",
  "ผู้รับผิดชอบ": "assignedToName",
  "ช่าง": "assignedToName",
  "assignedto": "assignedToName",
  "สถานะ": "status",
  "status": "status",
  "eta": "etaManual",
  "eta manual": "etaManual",
  "etamanual": "etaManual",
  "กำหนดเสร็จ": "etaManual",
  "เช็ค": "checkDone",
  "เสร็จ": "checkDone",
  "done": "checkDone",
  "check": "checkDone",
};

// Status label → code
const STATUS_REVERSE: Record<string, Status> = {};
for (const s of STATUSES) {
  STATUS_REVERSE[s] = s;
  STATUS_REVERSE[s.toLowerCase()] = s;
  STATUS_REVERSE[STATUS_LABEL[s]] = s;
}

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/\s+/g, " ");
}

function excelDateToISO(v: any): string {
  if (v == null || v === "") return "";
  // Excel serial number
  if (typeof v === "number") {
    const dt = XLSX.SSF.parse_date_code(v);
    if (dt) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${dt.y}-${pad(dt.m)}-${pad(dt.d)}`;
    }
  }
  // already ISO-ish string
  const s = String(v).trim();
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return s;
}

type Row = {
  docNo?: string;
  orderDate?: string;
  deliveryTime?: string;
  customer?: string;
  item?: string;
  qty?: number;
  assignedToName?: string;
  status?: string;
  etaManual?: string;
  checkDone?: boolean;
  _err?: string;
};

function parseBool(v: any): boolean {
  if (v === true) return true;
  if (v === false || v == null || v === "") return false;
  const s = String(v).trim().toLowerCase();
  return ["true", "1", "yes", "y", "✓", "✔", "ใช่", "เสร็จ", "ok"].includes(s);
}

export default function UploadExcel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      [
        "เลขที่เอกสาร",
        "วันที่สั่งผลิต",
        "เช็ค",
        "Delivery time",
        "ลูกค้า",
        "รายการ",
        "จำนวน",
        "ผู้รับผิดชอบ",
        "ETA Manual",
      ],
      ["JU6901005", "2026-05-21", false, "3-5 วันทำการ", "ABC จำกัด", "X-100", 10, "ช่างตี๋", ""],
      ["JU6901006", "2026-05-22", true,  "ด่วน", "XYZ จำกัด", "Y-200", 5, "ช่างศัก", "2026-05-28"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jobs");
    XLSX.writeFile(wb, "template-jobs.xlsx");
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
        if (mapped) row[mapped] = r[k];
      }
      // normalize
      if (row.orderDate) row.orderDate = excelDateToISO(row.orderDate);
      if (row.etaManual) row.etaManual = excelDateToISO(row.etaManual);
      if (row.status) row.status = STATUS_REVERSE[String(row.status).trim()] ?? "PENDING";
      if (row.qty != null && row.qty !== "") row.qty = Number(row.qty);
      if (row.docNo != null) row.docNo = String(row.docNo).trim();
      if (row.assignedToName != null) row.assignedToName = String(row.assignedToName).trim();
      if ("checkDone" in row) {
        row.checkDone = parseBool(row.checkDone);
        row.status = row.checkDone ? "DONE" : "PENDING";
      }

      return row as Row;
    });

    setRows(parsed);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function commit() {
    if (rows.length === 0) return;
    setBusy(true);
    const res = await fetch("/api/jobs/bulk", {
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
      `สร้าง ${j.createdCount} แถว / error ${j.errorCount}` +
        (j.errorCount ? "\n" + j.errors.map((e: any) => `แถว ${e.row}: ${JSON.stringify(e.error)}`).join("\n") : "")
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
              <h2 className="font-bold text-lg">อัปโหลด Excel</h2>
              <button onClick={() => setOpen(false)} className="text-gray-500">✕</button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={downloadTemplate}
                className="text-sm px-3 py-1.5 border rounded">
                ⬇ ดาวน์โหลด template
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={onFile}
                className="text-sm"
              />
            </div>

            <div className="text-xs text-gray-600 mb-2">
              คอลัมน์: เลขที่เอกสาร, วันที่สั่งผลิต, <b>เช็ค (TRUE=เสร็จสิ้น, FALSE=รอผลิต)</b>, Delivery time, ลูกค้า, รายการ, จำนวน, ผู้รับผิดชอบ, ETA Manual<br />
              ทุกคอลัมน์ optional — ที่ขาดจะเติม default ให้
            </div>

            {rows.length > 0 && (
              <>
                <div className="overflow-x-auto max-h-96 border rounded">
                  <table className="data-table text-xs">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>เลขที่เอกสาร</th>
                        <th>วันสั่ง</th>
                        <th>เช็ค</th>
                        <th>Delivery</th>
                        <th>ลูกค้า</th>
                        <th>รายการ</th>
                        <th>จำนวน</th>
                        <th>ผู้รับผิดชอบ</th>
                        <th>สถานะ</th>
                        <th>ETA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td>{r.docNo}</td>
                          <td>{r.orderDate}</td>
                          <td className="text-center">{r.checkDone ? "✓" : ""}</td>
                          <td>{r.deliveryTime}</td>
                          <td>{r.customer}</td>
                          <td>{r.item}</td>
                          <td className="text-center">{r.qty}</td>
                          <td>{r.assignedToName ?? "-"}</td>
                          <td>{r.status ?? "PENDING"}</td>
                          <td>{r.etaManual ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => setRows([])}
                    className="px-3 py-1.5 text-sm border rounded">ล้าง</button>
                  <button onClick={commit} disabled={busy}
                    className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50">
                    {busy ? "กำลังบันทึก..." : `ยืนยันอัปโหลด (${rows.length} แถว)`}
                  </button>
                </div>
              </>
            )}

            {result && (
              <pre className="mt-3 text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded border">
                {result}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
