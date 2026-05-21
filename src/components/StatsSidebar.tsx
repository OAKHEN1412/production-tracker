import type { Overall, WorkerStat } from "@/lib/stats";

const MONTH_NAMES = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function thMonth() {
  const d = new Date();
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export default function StatsSidebar({
  overall,
  workers,
}: {
  overall: Overall;
  workers: WorkerStat[];
}) {
  return (
    <aside className="lg:sticky lg:top-16 lg:self-start space-y-3 lg:w-72 lg:flex-shrink-0">
      {/* ภาพรวม */}
      <div className="bg-white rounded shadow p-4">
        <h2 className="font-bold text-sm mb-3 flex items-center gap-2">
          📊 ภาพรวมการผลิต
        </h2>
        <div className="space-y-2 text-sm">
          <Row label="งานทั้งหมด" value={overall.totalJobs} cls="text-gray-700" big />
          <Row label="🔵 กำลังผลิต" sub={`${overall.inProgress.qty} ชิ้น`}
            value={overall.inProgress.jobs} cls="text-blue-700" />
          <Row label="⚪ รอผลิต" sub={`${overall.pending.qty} ชิ้น`}
            value={overall.pending.jobs} cls="text-gray-600" />
          <Row label="🟡 หยุดชั่วคราว" sub={`${overall.paused.qty} ชิ้น`}
            value={overall.paused.jobs} cls="text-yellow-700" />
          <Row label="🟣 QC" sub={`${overall.qc.qty} ชิ้น`}
            value={overall.qc.jobs} cls="text-purple-700" />
          <div className="border-t pt-2 mt-2">
            <div className="text-xs text-gray-500 mb-1">เสร็จเดือนนี้ ({thMonth()})</div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold text-green-700">{overall.doneThisMonth.qty}</div>
                <div className="text-xs text-gray-500">ชิ้น</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-green-600">{overall.doneThisMonth.jobs}</div>
                <div className="text-xs text-gray-500">งาน</div>
              </div>
            </div>
          </div>
          {overall.cancelled > 0 && (
            <div className="text-xs text-red-600">ยกเลิก: {overall.cancelled}</div>
          )}
        </div>
      </div>

      {/* ตามช่าง */}
      <div className="bg-white rounded shadow p-4">
        <h2 className="font-bold text-sm mb-1 flex items-center gap-2">
          👷 ตามช่าง
        </h2>
        <div className="text-xs text-gray-500 mb-3">เดือนนี้ + งานที่รับผิดชอบ</div>
        {workers.length === 0 && (
          <div className="text-xs text-gray-400 py-4 text-center">ยังไม่มีงานที่กำหนดช่าง</div>
        )}
        <div className="space-y-3">
          {workers.map((w) => (
            <div key={w.id} className="border-b last:border-b-0 pb-2 last:pb-0">
              <div className="font-semibold text-sm mb-1">{w.name}</div>
              <div className="grid grid-cols-3 gap-1 text-center">
                <Stat label="เสร็จ" jobs={w.doneThisMonth.jobs} qty={w.doneThisMonth.qty} cls="text-green-700 bg-green-50" />
                <Stat label="กำลังทำ" jobs={w.inProgress.jobs} qty={w.inProgress.qty} cls="text-blue-700 bg-blue-50" />
                <Stat label="รอ" jobs={w.pending.jobs} qty={w.pending.qty} cls="text-gray-600 bg-gray-50" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Row({ label, sub, value, cls, big }: {
  label: string;
  sub?: string;
  value: number;
  cls?: string;
  big?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col">
        <span className={`text-xs ${cls ?? "text-gray-600"}`}>{label}</span>
        {sub && <span className="text-[10px] text-gray-400">{sub}</span>}
      </div>
      <span className={`${big ? "text-xl font-bold" : "text-base font-semibold"} ${cls ?? ""}`}>
        {value}
      </span>
    </div>
  );
}

function Stat({ label, jobs, qty, cls }: {
  label: string;
  jobs: number;
  qty: number;
  cls: string;
}) {
  return (
    <div className={`rounded p-1.5 ${cls}`}>
      <div className="text-[10px] uppercase">{label}</div>
      <div className="font-bold text-sm">{qty}</div>
      <div className="text-[10px]">({jobs} งาน)</div>
    </div>
  );
}
