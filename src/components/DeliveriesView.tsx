"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isLengthTracked } from "@/lib/materials";

type MaterialOpt = { id: string; name: string; unit: string; code: string | null };
type Delivery = {
  id: string;
  title: string;
  note: string | null;
  qtyReceived: number;
  materialId: string | null;
  createdAt: string;
  material: { name: string; unit: string } | null;
  createdBy: { name: string } | null;
};

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

// Resize + compress to keep the stored confirmation photo small.
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

export default function DeliveriesView({
  deliveries: initial,
  materials,
  canReceive,
}: {
  deliveries: Delivery[];
  materials: MaterialOpt[];
  canReceive: boolean;
}) {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState<Delivery[]>(initial);
  useEffect(() => { setDeliveries(initial); }, [initial]);

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState(0);
  const [lengthMm, setLengthMm] = useState(0);
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const selectedUnit = materials.find((m) => m.id === materialId)?.unit;
  const lengthTracked = isLengthTracked(selectedUnit);

  const inp = "border rounded px-3 py-2 w-full text-sm";

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await compressImage(file));
    } catch {
      alert("อ่านรูปไม่ได้ ลองใหม่");
    }
  }

  async function submit() {
    if (!title.trim()) { alert("ใส่ชื่อ/รายละเอียดพัสดุ"); return; }
    if (!photo) { alert("ต้องถ่าย/แนบรูปยืนยัน"); return; }
    if (lengthTracked && Number(qty) > 0 && !(Number(lengthMm) > 0)) {
      alert("ระบุความยาวต่อเส้น (mm)"); return;
    }
    setBusy(true);
    const res = await fetch("/api/deliveries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title, note: note || null, photo,
        materialId: materialId || null,
        qtyReceived: materialId ? Number(qty) : 0,
        lengthMm: lengthTracked ? Number(lengthMm) : 0,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert("บันทึกไม่ได้: " + (typeof j.error === "string" ? j.error : JSON.stringify(j.error)));
      return;
    }
    setTitle(""); setNote(""); setMaterialId(""); setQty(0); setLengthMm(0); setPhoto("");
    const fresh = await fetch("/api/deliveries").then((r) => r.json());
    setDeliveries(fresh);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {canReceive && (
        <div className="bg-white p-4 rounded shadow space-y-3">
          <div className="font-semibold text-sm">+ รับพัสดุเข้าคลัง</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <div className="text-xs text-gray-600">ชื่อ / รายละเอียดพัสดุ *</div>
              <input className={inp} value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น ท่อสแตนเลส ลอต 5 / ออเดอร์ supplier ABC" />
            </div>
            <div>
              <div className="text-xs text-gray-600">บวกเข้าสต๊อกวัสดุ (ถ้ามี)</div>
              <select className={inp} value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                <option value="">- ไม่ผูกวัสดุ -</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>{m.code ? `[${m.code}] ` : ""}{m.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs text-gray-600">จำนวนรับเข้า{lengthTracked ? " (เส้น)" : ""}</div>
              <input type="number" min={0} step="any" className={inp} value={qty}
                disabled={!materialId}
                onChange={(e) => setQty(Number(e.target.value))} />
            </div>
            {lengthTracked && (
              <div className="sm:col-span-2">
                <div className="text-xs text-gray-600">ความยาวต่อเส้น (mm) *</div>
                <input type="number" min={0} step="any" className={inp} value={lengthMm}
                  placeholder="เช่น 6000"
                  onChange={(e) => setLengthMm(Number(e.target.value))} />
                <div className="text-[11px] text-gray-400 mt-0.5">
                  วัสดุหน่วย "{selectedUnit}" — ระบุความยาวของแต่ละเส้นที่รับเข้า (เส้นยาว/สั้นแยกบันทึกได้)
                </div>
              </div>
            )}
            <div className="sm:col-span-2">
              <div className="text-xs text-gray-600">หมายเหตุ</div>
              <input className={inp} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {/* Photo confirmation — camera on mobile */}
          <div>
            <div className="text-xs text-gray-600 mb-1">รูปยืนยัน * (มือถือจะเปิดกล้อง)</div>
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="text-sm" />
            {photo && (
              <img src={photo} alt="preview" className="mt-2 max-h-48 rounded border" />
            )}
          </div>

          <div className="flex justify-end">
            <button onClick={submit} disabled={busy || !title.trim() || !photo}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50">
              {busy ? "กำลังบันทึก..." : "✓ ยืนยันรับเข้าคลัง"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {deliveries.length === 0 ? (
        <div className="bg-white rounded shadow p-6 text-center text-gray-500 text-sm">ยังไม่มีการรับเข้า</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {deliveries.map((d) => (
            <div key={d.id} className="bg-white rounded shadow overflow-hidden">
              <img
                src={`/api/deliveries/${d.id}/photo`}
                alt={d.title}
                loading="lazy"
                onClick={() => setZoom(`/api/deliveries/${d.id}/photo`)}
                className="w-full h-40 object-cover cursor-zoom-in bg-gray-100"
              />
              <div className="p-3">
                <div className="font-semibold text-sm">{d.title}</div>
                {d.material && (
                  <div className="text-xs text-emerald-700">
                    + {d.qtyReceived} {d.material.unit} → {d.material.name}
                  </div>
                )}
                {d.note && <div className="text-xs text-gray-500 mt-0.5">{d.note}</div>}
                <div className="text-xs text-gray-400 mt-1">
                  {d.createdBy?.name ?? "-"} · {fmtDateTime(d.createdAt)}
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
