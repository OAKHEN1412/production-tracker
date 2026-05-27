"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type QueueJob = {
  id: string;
  seq: number;
  docNo: string;
  customer: string;
  item: string;
  qty: number;
  orderDate: string | null;
  assignedTo: { name: string } | null;
  salesOwner: { name: string } | null;
  assemblies: { name: string; qty: number }[];
};
type Shipment = {
  id: string;
  note: string | null;
  shippedAt: string;
  job: { seq: number; docNo: string; customer: string; item: string; qty: number } | null;
  createdBy: { name: string } | null;
};

function fmtDateTime(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

// Resize + compress so the stored confirmation photo stays small.
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read fail"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode fail"));
      img.onload = () => {
        const max = 1024;
        let { width, height } = img;
        if (width > max || height > max) {
          if (width >= height) { height = Math.round((height * max) / width); width = max; }
          else { width = Math.round((width * max) / height); height = max; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no ctx"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ShippingView({
  queue: initialQueue,
  shipments: initialShipments,
  initialTab,
}: {
  queue: QueueJob[];
  shipments: Shipment[];
  initialTab: "queue" | "history";
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"queue" | "history">(initialTab);
  const [queue, setQueue] = useState<QueueJob[]>(initialQueue);
  const [shipments, setShipments] = useState<Shipment[]>(initialShipments);
  useEffect(() => { setQueue(initialQueue); }, [initialQueue]);
  useEffect(() => { setShipments(initialShipments); }, [initialShipments]);

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  function beginConfirm(id: string) {
    setConfirmId(id);
    setNote("");
    setPhoto("");
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await compressImage(file));
    } catch {
      alert("อ่านรูปไม่ได้ ลองใหม่");
    }
  }

  async function submit(jobId: string) {
    if (!photo) { alert("ต้องถ่าย/แนบรูปยืนยันการส่ง"); return; }
    setBusy(true);
    const res = await fetch("/api/shipments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, photo, note: note || null }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert("บันทึกไม่ได้: " + (typeof j.error === "string" ? j.error : JSON.stringify(j.error)));
      return;
    }
    setConfirmId(null);
    setNote("");
    setPhoto("");
    // Job left the queue (รอจัดส่ง → รอผลิต); pull fresh lists.
    router.refresh();
  }

  const tabCls = (t: string) =>
    `px-3 py-1.5 text-sm rounded-t border-b-2 ${tab === t ? "border-teal-600 text-teal-700 font-semibold" : "border-transparent text-gray-500 hover:text-gray-700"}`;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 border-b">
        <button className={tabCls("queue")} onClick={() => setTab("queue")}>
          รอจัดส่ง ({queue.length})
        </button>
        <button className={tabCls("history")} onClick={() => setTab("history")}>
          มาส่งแล้ว ({shipments.length})
        </button>
      </div>

      {tab === "queue" ? (
        queue.length === 0 ? (
          <div className="bg-white rounded shadow p-8 text-center text-gray-500 text-sm">
            ไม่มีงานรอจัดส่ง 🎉 (งานที่ฝ่ายผลิตอนุมัติจะมาโผล่ที่นี่)
          </div>
        ) : (
          <div className="space-y-2">
            {queue.map((j) => (
              <div key={j.id} className="bg-white rounded shadow p-4 border-l-4 border-teal-400">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-mono">#{j.seq}</span>
                      <span className="font-mono text-sm text-gray-800">{j.docNo}</span>
                    </div>
                    <div className="font-semibold text-sm">{j.customer}</div>
                    <div className="text-sm text-gray-800 font-mono font-medium">{j.item} · {j.qty} ชิ้น</div>
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    <div>ช่าง: {j.assignedTo?.name ?? "-"}</div>
                    <div>เซล: {j.salesOwner?.name ?? "-"}</div>
                    <div>สั่งผลิต: {fmtDateTime(j.orderDate)}</div>
                  </div>
                </div>

                {/* Assembly list to bring — qty × produced units. No materials shown. */}
                <div className="mt-2 bg-teal-50 border border-teal-200 rounded p-2">
                  <div className="text-xs font-semibold text-teal-800 mb-1">📦 ของที่ต้องเอาไปผลิต (× {j.qty} ตัว)</div>
                  {j.assemblies.length === 0 ? (
                    <div className="text-xs text-gray-400">— ไม่มีรายการชุดประกอบ (ตั้งได้ที่หน้ารุ่นกระบอก) —</div>
                  ) : (
                    <ul className="text-sm space-y-0.5">
                      {j.assemblies.map((a, k) => (
                        <li key={k} className="flex justify-between">
                          <span>{a.name}</span>
                          <span className="font-semibold text-teal-900">{a.qty * j.qty} ชุด <span className="text-xs text-gray-500 font-normal">({a.qty}×{j.qty})</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {confirmId === j.id ? (
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <div>
                      <div className="text-xs text-gray-600 mb-1">รูปยืนยันการมาส่ง * (มือถือจะเปิดกล้อง)</div>
                      <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="text-sm" />
                      {photo && <img src={photo} alt="preview" className="mt-2 max-h-48 rounded border" />}
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">มาส่งอุปกรณ์อะไร / หมายเหตุ</div>
                      <input className="border rounded px-3 py-2 w-full text-sm" value={note}
                        onChange={(e) => setNote(e.target.value)} placeholder="เช่น ท่อ + ลูกสูบ ครบตามลิสต์ / ผู้มาส่ง" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setConfirmId(null)} className="px-3 py-1.5 text-sm border rounded">
                        ยกเลิก
                      </button>
                      <button onClick={() => submit(j.id)} disabled={busy || !photo}
                        className="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded disabled:opacity-50">
                        {busy ? "กำลังบันทึก..." : "✓ ยืนยันมาส่งของแล้ว"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex justify-end">
                    <button onClick={() => beginConfirm(j.id)}
                      className="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded">
                      📦 ยืนยันมาส่งของ
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : shipments.length === 0 ? (
        <div className="bg-white rounded shadow p-8 text-center text-gray-500 text-sm">ยังไม่มีการมาส่ง</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {shipments.map((s) => (
            <div key={s.id} className="bg-white rounded shadow overflow-hidden">
              <img
                src={`/api/shipments/${s.id}/photo`}
                alt={s.job?.docNo ?? "shipment"}
                loading="lazy"
                onClick={() => setZoom(`/api/shipments/${s.id}/photo`)}
                className="w-full h-40 object-cover cursor-zoom-in bg-gray-100"
              />
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-mono">#{s.job?.seq}</span>
                  <span className="font-mono text-sm text-gray-800">{s.job?.docNo}</span>
                </div>
                <div className="font-semibold text-sm">{s.job?.customer}</div>
                <div className="text-sm text-gray-800 font-mono font-medium">{s.job?.item} · {s.job?.qty} ชิ้น</div>
                {s.note && <div className="text-xs text-gray-500 mt-0.5">{s.note}</div>}
                <div className="text-xs text-gray-400 mt-1">
                  {s.createdBy?.name ?? "-"} · {fmtDateTime(s.shippedAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-40 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoom(null)}>
          <img src={zoom} alt="zoom" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </div>
  );
}
