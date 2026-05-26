"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MATERIAL_CATEGORIES, MATERIAL_UNITS, isLowStock, type Material } from "@/lib/materials";
import UploadMaterialsExcel from "./UploadMaterialsExcel";

type Draft = {
  code: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  minQty: number;
  location: string;
  notes: string;
};

function emptyDraft(): Draft {
  return { code: "", name: "", category: MATERIAL_CATEGORIES[0], unit: MATERIAL_UNITS[0], qty: 0, minQty: 0, location: "", notes: "" };
}
function toDraft(m: Material): Draft {
  return {
    code: m.code ?? "",
    name: m.name,
    category: m.category,
    unit: m.unit,
    qty: m.qty,
    minQty: m.minQty,
    location: m.location ?? "",
    notes: m.notes ?? "",
  };
}
// withQty=true only on create (set the opening balance). On edit we deliberately
// omit qty: stock changes must go through "± ปรับ" (relative adjustDelta) or
// receiving, so a slow edit can't clobber deductions made while the form was open.
function payload(d: Draft, withQty: boolean) {
  return {
    code: d.code || null,
    name: d.name,
    category: d.category,
    unit: d.unit,
    ...(withQty ? { qty: Number(d.qty) } : {}),
    minQty: Number(d.minQty),
    location: d.location || null,
    notes: d.notes || null,
  };
}

const input = "border rounded px-2 py-1 text-xs w-full";

export default function MaterialsTable({
  materials: initial,
  canEdit,
}: {
  materials: Material[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [materials, setMaterials] = useState<Material[]>(initial);
  useEffect(() => { setMaterials(initial); }, [initial]);

  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("ALL");
  const [lowOnly, setLowOnly] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);

  const lowCount = useMemo(() => materials.filter(isLowStock).length, [materials]);

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      if (cat !== "ALL" && m.category !== cat) return false;
      if (lowOnly && !isLowStock(m)) return false;
      if (!q) return true;
      const s = q.toLowerCase();
      return (
        m.name.toLowerCase().includes(s) ||
        (m.code?.toLowerCase().includes(s) ?? false) ||
        m.category.toLowerCase().includes(s) ||
        (m.location?.toLowerCase().includes(s) ?? false)
      );
    });
  }, [materials, q, cat, lowOnly]);

  async function refresh() {
    const fresh = await fetch("/api/materials").then((r) => r.json());
    setMaterials(fresh);
    router.refresh();
  }

  async function createMaterial() {
    if (!draft.name) return;
    setBusyId("__new");
    const res = await fetch("/api/materials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload(draft, true)),
    });
    setBusyId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert("เพิ่มไม่ได้: " + (typeof j.error === "string" ? j.error : JSON.stringify(j.error)));
      return;
    }
    setAdding(false);
    setDraft(emptyDraft());
    await refresh();
  }

  async function saveEdit() {
    if (!editId || !editDraft) return;
    setBusyId(editId);
    const res = await fetch(`/api/materials/${editId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload(editDraft, false)),
    });
    setBusyId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert("บันทึกไม่ได้: " + (typeof j.error === "string" ? j.error : JSON.stringify(j.error)));
      return;
    }
    setEditId(null);
    setEditDraft(null);
    await refresh();
  }

  async function adjust(m: Material) {
    const raw = prompt(`ปรับสต๊อก "${m.name}" (คงเหลือ ${m.qty} ${m.unit})\nใส่จำนวน: บวก = รับเข้า, ลบ = เบิกออก (เช่น 10 หรือ -3)`);
    if (raw == null) return;
    const delta = Number(raw.trim());
    if (!Number.isFinite(delta) || delta === 0) return;
    setBusyId(m.id);
    const res = await fetch(`/api/materials/${m.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adjustDelta: delta }),
    });
    setBusyId(null);
    if (!res.ok) { alert("ปรับไม่ได้"); return; }
    await refresh();
  }

  async function del(m: Material) {
    if (!confirm(`ลบวัสดุ "${m.name}"?`)) return;
    setBusyId(m.id);
    const res = await fetch(`/api/materials/${m.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(typeof j.error === "string" ? j.error : "ลบไม่ได้");
      return;
    }
    await refresh();
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="bg-white p-3 rounded shadow flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="border rounded px-3 py-2 text-sm flex-1"
            placeholder="🔍 ค้นหา ชื่อ, รหัส, หมวด, ที่เก็บ..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setAdding(!adding)}
                className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded whitespace-nowrap"
              >
                {adding ? "✕ ปิดฟอร์ม" : "+ เพิ่มวัสดุ"}
              </button>
              <UploadMaterialsExcel />
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <Chip active={cat === "ALL" && !lowOnly} onClick={() => { setCat("ALL"); setLowOnly(false); }}
            label={`ทั้งหมด (${materials.length})`} cls="bg-gray-700 text-white" />
          <Chip active={lowOnly} onClick={() => { setLowOnly(true); setCat("ALL"); }}
            label={`⚠ ใกล้หมด (${lowCount})`} cls="bg-red-600 text-white" />
          {MATERIAL_CATEGORIES.map((c) => (
            <Chip key={c} active={cat === c && !lowOnly} onClick={() => { setCat(c); setLowOnly(false); }}
              label={c} cls="bg-blue-600 text-white" />
          ))}
        </div>
      </div>

      {/* Inline add */}
      {adding && canEdit && (
        <div className="bg-white p-4 rounded shadow border-2 border-green-400">
          <div className="font-semibold mb-3 text-sm">+ วัสดุใหม่</div>
          <Fields draft={draft} setDraft={setDraft} />
          <div className="flex gap-2 mt-3 justify-end">
            <button onClick={() => { setAdding(false); setDraft(emptyDraft()); }}
              className="px-4 py-1.5 text-sm border rounded">ยกเลิก</button>
            <button onClick={createMaterial} disabled={busyId === "__new" || !draft.name}
              className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50">
              {busyId === "__new" ? "..." : "บันทึก"}
            </button>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded shadow overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อวัสดุ</th>
              <th>หมวด</th>
              <th className="text-center">คงเหลือ</th>
              <th className="text-center">ขั้นต่ำ</th>
              <th>หน่วย</th>
              <th>ที่เก็บ</th>
              {canEdit && <th className="text-right">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={canEdit ? 8 : 7} className="text-center text-gray-500 py-8">ไม่มีวัสดุ</td></tr>
            )}
            {filtered.map((m) => {
              const isEdit = editId === m.id && editDraft;
              const low = isLowStock(m);
              if (isEdit) {
                return (
                  <tr key={m.id} className="bg-yellow-50">
                    <td><input className={input} value={editDraft!.code}
                      onChange={(e) => setEditDraft({ ...editDraft!, code: e.target.value })} /></td>
                    <td><input className={input} value={editDraft!.name}
                      onChange={(e) => setEditDraft({ ...editDraft!, name: e.target.value })} /></td>
                    <td>
                      <select className={input} value={editDraft!.category}
                        onChange={(e) => setEditDraft({ ...editDraft!, category: e.target.value })}>
                        {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td><input type="number" disabled title="เปลี่ยนสต๊อกผ่านปุ่ม ± ปรับ"
                      className={input + " text-center bg-gray-100 text-gray-400 cursor-not-allowed"} value={editDraft!.qty} readOnly /></td>
                    <td><input type="number" className={input + " text-center"} value={editDraft!.minQty}
                      onChange={(e) => setEditDraft({ ...editDraft!, minQty: Number(e.target.value) })} /></td>
                    <td>
                      <select className={input} value={editDraft!.unit}
                        onChange={(e) => setEditDraft({ ...editDraft!, unit: e.target.value })}>
                        {MATERIAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td><input className={input} value={editDraft!.location}
                      onChange={(e) => setEditDraft({ ...editDraft!, location: e.target.value })} /></td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={saveEdit} disabled={busyId === m.id}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 rounded mr-1 disabled:opacity-50">
                        ✓ บันทึก
                      </button>
                      <button onClick={() => { setEditId(null); setEditDraft(null); }}
                        className="text-gray-600 text-xs px-2 py-1 hover:underline">ยกเลิก</button>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={m.id} className={low ? "bg-red-50" : ""}>
                  <td className="font-mono text-xs">{m.code ?? <span className="text-gray-300">-</span>}</td>
                  <td>
                    {m.name}
                    {m.notes && <div className="text-xs text-gray-400">{m.notes}</div>}
                  </td>
                  <td className="text-xs">{m.category}</td>
                  <td className="text-center font-semibold">
                    <span className={low ? "text-red-600" : ""}>{m.qty}</span>
                    {low && <span className="ml-1 text-xs text-red-500" title="ต่ำกว่าขั้นต่ำ">⚠</span>}
                  </td>
                  <td className="text-center text-xs text-gray-500">{m.minQty || "-"}</td>
                  <td className="text-xs">{m.unit}</td>
                  <td className="text-xs">{m.location ?? <span className="text-gray-300">-</span>}</td>
                  {canEdit && (
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => adjust(m)} disabled={busyId === m.id}
                        className="text-emerald-700 text-xs px-2 py-1 hover:underline disabled:opacity-50">
                        ± ปรับ
                      </button>
                      <button onClick={() => { setEditId(m.id); setEditDraft(toDraft(m)); }}
                        className="text-blue-600 text-xs px-2 py-1 hover:underline">✎ แก้</button>
                      <button onClick={() => del(m)} disabled={busyId === m.id}
                        className="text-red-600 text-xs px-2 py-1 hover:underline disabled:opacity-50">ลบ</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.length === 0 && (
          <div className="bg-white rounded shadow p-6 text-center text-gray-500 text-sm">ไม่มีวัสดุ</div>
        )}
        {filtered.map((m) => {
          const isEdit = editId === m.id && editDraft;
          const low = isLowStock(m);
          if (isEdit) {
            return (
              <div key={m.id} className="bg-white rounded shadow p-3 border-2 border-yellow-400 space-y-2">
                <Fields draft={editDraft!} setDraft={(d) => setEditDraft(d)} compact editing />
                <div className="flex gap-2 pt-2 border-t">
                  <button onClick={() => { setEditId(null); setEditDraft(null); }}
                    className="text-xs px-3 py-1.5 rounded border">ยกเลิก</button>
                  <button onClick={saveEdit} disabled={busyId === m.id}
                    className="text-xs px-3 py-1.5 rounded bg-green-600 text-white ml-auto disabled:opacity-50">✓ บันทึก</button>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`bg-white rounded shadow p-3 ${low ? "border-l-4 border-red-500" : ""}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm">{m.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{m.code ?? "-"} · {m.category}</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${low ? "text-red-600" : ""}`}>{m.qty} {m.unit}</div>
                  {low && <div className="text-xs text-red-500">⚠ ใกล้หมด (ขั้นต่ำ {m.minQty})</div>}
                </div>
              </div>
              {m.location && <div className="text-xs text-gray-500 mt-1">ที่เก็บ: {m.location}</div>}
              {m.notes && <div className="text-xs text-gray-400 italic mt-1">{m.notes}</div>}
              {canEdit && (
                <div className="flex gap-2 mt-3 pt-2 border-t">
                  <button onClick={() => adjust(m)} disabled={busyId === m.id}
                    className="text-xs px-3 py-1.5 rounded border border-emerald-600 text-emerald-700 disabled:opacity-50">± ปรับสต๊อก</button>
                  <button onClick={() => { setEditId(m.id); setEditDraft(toDraft(m)); }}
                    className="text-xs px-3 py-1.5 rounded border border-blue-600 text-blue-600">✎ แก้</button>
                  <button onClick={() => del(m)} disabled={busyId === m.id}
                    className="text-xs px-3 py-1.5 rounded border border-red-600 text-red-600 disabled:opacity-50 ml-auto">ลบ</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ active, onClick, label, cls }: { active: boolean; onClick: () => void; label: string; cls: string }) {
  return (
    <button onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition ${active ? cls + " border-transparent font-semibold" : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
      {label}
    </button>
  );
}

function Fields({ draft, setDraft, compact, editing }: { draft: Draft; setDraft: (d: Draft) => void; compact?: boolean; editing?: boolean }) {
  const lbl = "text-xs text-gray-600";
  const inp = "border rounded px-2 py-1.5 w-full text-sm";
  const grid = compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 sm:grid-cols-3 gap-3";
  return (
    <div className={grid}>
      <div>
        <div className={lbl}>รหัส / Part no.</div>
        <input className={inp} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
      </div>
      <div className="col-span-1">
        <div className={lbl}>ชื่อวัสดุ *</div>
        <input className={inp} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </div>
      <div>
        <div className={lbl}>หมวด</div>
        <select className={inp} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
          {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <div className={lbl}>คงเหลือ{editing && " (ปรับผ่าน ± ปรับ)"}</div>
        <input type="number" className={inp + (editing ? " bg-gray-100 text-gray-400 cursor-not-allowed" : "")}
          value={draft.qty} disabled={editing} readOnly={editing}
          onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })} />
      </div>
      <div>
        <div className={lbl}>ขั้นต่ำ (แจ้งเตือน)</div>
        <input type="number" className={inp} value={draft.minQty} onChange={(e) => setDraft({ ...draft, minQty: Number(e.target.value) })} />
      </div>
      <div>
        <div className={lbl}>หน่วย</div>
        <select className={inp} value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })}>
          {MATERIAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      <div>
        <div className={lbl}>ที่เก็บ</div>
        <input className={inp} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
      </div>
      <div className={compact ? "col-span-2" : "col-span-2 sm:col-span-3"}>
        <div className={lbl}>หมายเหตุ</div>
        <input className={inp} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </div>
    </div>
  );
}
