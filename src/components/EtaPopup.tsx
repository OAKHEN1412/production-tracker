"use client";

type Job = {
  id: string;
  docNo: string;
  customer: string;
  item: string;
  qty: number;
  assignedTo: { id: string; name: string } | null;
  etaAuto: string | Date | null;
  etaManual: string | Date | null;
};

function fmtDateLong(d?: string | Date | null) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("th-TH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function EtaPopup({
  job,
  onClose,
  mode,
}: {
  job: Job;
  onClose: () => void;
  mode: "created" | "updated";
}) {
  const eta = job.etaManual ?? job.etaAuto;
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="text-3xl">{mode === "created" ? "✅" : "🔄"}</div>
          <div>
            <h2 className="font-bold text-lg">
              {mode === "created" ? "บันทึกงานแล้ว" : "อัปเดตงานแล้ว"}
            </h2>
            <p className="text-xs text-gray-500">ระบบคำนวณวันเสร็จให้อัตโนมัติ</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
          <div className="text-xs text-blue-700 mb-1">📅 กำหนดวันเสร็จ</div>
          <div className="text-2xl font-bold text-blue-900">
            {fmtDateLong(eta)}
          </div>
          {job.etaManual && (
            <div className="text-xs text-blue-600 mt-1">(กำหนดเอง)</div>
          )}
          {!job.etaManual && job.etaAuto && (
            <div className="text-xs text-blue-600 mt-1">(คำนวณอัตโนมัติจากคิวงาน)</div>
          )}
        </div>

        <div className="text-sm space-y-1 mb-4">
          <Row label="เลขที่เอกสาร" value={job.docNo} />
          <Row label="ลูกค้า" value={job.customer} />
          <Row label="รายการ" value={job.item} />
          <Row label="จำนวน" value={String(job.qty)} />
          <Row label="ผู้รับผิดชอบ" value={job.assignedTo?.name ?? "ยังไม่กำหนด"} />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold"
          >
            รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 py-1">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
