"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { isLengthTracked } from "@/lib/materials";

type MaterialOpt = { id: string; name: string; unit: string; code: string | null };
type Recipe = { materialId: string; qtyPerUnit: number; cutLengthMm: number };
type Product = {
  id: string;
  code: string | null;
  name: string;
  notes: string | null;
  materials: { id: string; materialId: string; qtyPerUnit: number; cutLengthMm: number; material: MaterialOpt }[];
};

type Draft = { code: string; name: string; notes: string; mats: Recipe[] };

function emptyDraft(): Draft {
  return { code: "", name: "", notes: "", mats: [] };
}
function toDraft(p: Product): Draft {
  return {
    code: p.code ?? "",
    name: p.name,
    notes: p.notes ?? "",
    mats: p.materials.map((m) => ({ materialId: m.materialId, qtyPerUnit: m.qtyPerUnit, cutLengthMm: m.cutLengthMm ?? 0 })),
  };
}
function payload(d: Draft) {
  return {
    code: d.code || null,
    name: d.name,
    notes: d.notes || null,
    materials: d.mats
      .filter((m) => m.materialId && Number(m.qtyPerUnit) > 0)
      .map((m) => ({ materialId: m.materialId, qtyPerUnit: Number(m.qtyPerUnit), cutLengthMm: Number(m.cutLengthMm) || 0 })),
  };
}

const inp = "border rounded px-2 py-1.5 text-sm w-full";

export default function ProductsTable({
  products: initial,
  allMaterials,
  canEdit,
}: {
  products: Product[];
  allMaterials: MaterialOpt[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initial);
  useEffect(() => { setProducts(initial); }, [initial]);

  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);

  const filtered = useMemo(() => {
    if (!q) return products;
    const s = q.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.code?.toLowerCase().includes(s) ?? false) ||
        p.materials.some((m) => m.material.name.toLowerCase().includes(s))
    );
  }, [products, q]);

  async function refresh() {
    const fresh = await fetch("/api/products").then((r) => r.json());
    setProducts(fresh);
    router.refresh();
  }

  async function create() {
    if (!draft.name) return;
    setBusyId("__new");
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload(draft)),
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
    const res = await fetch(`/api/products/${editId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload(editDraft)),
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

  async function del(p: Product) {
    if (!confirm(`ลบรุ่น "${p.name}"?`)) return;
    setBusyId(p.id);
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) { alert("ลบไม่ได้"); return; }
    await refresh();
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="bg-white p-3 rounded shadow flex flex-col sm:flex-row gap-2">
        <input
          className="border rounded px-3 py-2 text-sm flex-1"
          placeholder="🔍 ค้นหา รุ่น, รหัส, วัสดุ..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {canEdit && (
          <button
            onClick={() => { setAdding(!adding); setDraft(emptyDraft()); }}
            className="bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded whitespace-nowrap"
          >
            {adding ? "✕ ปิดฟอร์ม" : "+ เพิ่มรุ่นกระบอก"}
          </button>
        )}
      </div>

      {/* Add */}
      {adding && canEdit && (
        <div className="bg-white p-4 rounded shadow border-2 border-green-400">
          <div className="font-semibold mb-3 text-sm">+ รุ่นกระบอกใหม่</div>
          <Fields draft={draft} setDraft={setDraft} allMaterials={allMaterials} />
          <div className="flex gap-2 mt-3 justify-end">
            <button onClick={() => { setAdding(false); setDraft(emptyDraft()); }}
              className="px-4 py-1.5 text-sm border rounded">ยกเลิก</button>
            <button onClick={create} disabled={busyId === "__new" || !draft.name}
              className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50">
              {busyId === "__new" ? "..." : "บันทึก"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 && (
        <div className="bg-white rounded shadow p-6 text-center text-gray-500 text-sm">ยังไม่มีรุ่นกระบอก</div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {filtered.map((p) => {
          const isEdit = editId === p.id && editDraft;
          if (isEdit) {
            return (
              <div key={p.id} className="bg-white rounded shadow p-4 border-2 border-yellow-400">
                <Fields draft={editDraft!} setDraft={(d) => setEditDraft(d)} allMaterials={allMaterials} />
                <div className="flex gap-2 mt-3 justify-end">
                  <button onClick={() => { setEditId(null); setEditDraft(null); }}
                    className="px-4 py-1.5 text-sm border rounded">ยกเลิก</button>
                  <button onClick={saveEdit} disabled={busyId === p.id}
                    className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50">
                    {busyId === p.id ? "..." : "✓ บันทึก"}
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div key={p.id} className="bg-white rounded shadow p-4">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{p.name}</div>
                  {p.code && <div className="text-xs text-gray-500 font-mono">{p.code}</div>}
                  {p.notes && <div className="text-xs text-gray-400 italic">{p.notes}</div>}
                </div>
                {canEdit && (
                  <div className="flex gap-2 whitespace-nowrap">
                    <button onClick={() => { setEditId(p.id); setEditDraft(toDraft(p)); }}
                      className="text-blue-600 text-xs hover:underline">✎ แก้</button>
                    <button onClick={() => del(p)} disabled={busyId === p.id}
                      className="text-red-600 text-xs hover:underline disabled:opacity-50">ลบ</button>
                  </div>
                )}
              </div>
              <div className="mt-2 border-t pt-2">
                <div className="text-xs text-gray-500 mb-1">วัสดุต่อ 1 กระบอก:</div>
                {p.materials.length === 0 ? (
                  <div className="text-xs text-gray-400">ยังไม่ได้ระบุวัสดุ</div>
                ) : (
                  <ul className="text-sm space-y-0.5">
                    {p.materials.map((m) => (
                      <li key={m.id} className="flex justify-between">
                        <span>{m.material.code ? `[${m.material.code}] ` : ""}{m.material.name}</span>
                        <span className="text-gray-600">
                          {isLengthTracked(m.material.unit) && m.cutLengthMm > 0
                            ? `ตัด ${m.cutLengthMm} mm/หน่วย`
                            : `${m.qtyPerUnit} ${m.material.unit}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Fields({
  draft,
  setDraft,
  allMaterials,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  allMaterials: MaterialOpt[];
}) {
  const lbl = "text-xs text-gray-600";
  function unitOf(id: string) {
    return allMaterials.find((m) => m.id === id)?.unit ?? "";
  }
  function addMat() { setDraft({ ...draft, mats: [...draft.mats, { materialId: "", qtyPerUnit: 1, cutLengthMm: 0 }] }); }
  function updateMat(i: number, patch: Partial<Recipe>) {
    setDraft({ ...draft, mats: draft.mats.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) });
  }
  function removeMat(i: number) {
    setDraft({ ...draft, mats: draft.mats.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <div className={lbl}>ชื่อรุ่น *</div>
          <input className={inp} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <div className={lbl}>รหัส</div>
          <input className={inp} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
        </div>
        <div>
          <div className={lbl}>หมายเหตุ</div>
          <input className={inp} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <div className={lbl}>วัสดุต่อ 1 กระบอก</div>
          {allMaterials.length > 0 && (
            <button type="button" onClick={addMat}
              className="text-xs text-blue-600 hover:underline">+ เพิ่มวัสดุ</button>
          )}
        </div>
        {allMaterials.length === 0 ? (
          <div className="text-xs text-gray-400">ยังไม่มีวัสดุในสต๊อก — เพิ่มที่หน้า “สต๊อกวัสดุ” ก่อน</div>
        ) : draft.mats.length === 0 ? (
          <div className="text-xs text-gray-400">ยังไม่ได้ระบุวัสดุ</div>
        ) : (
          <div className="space-y-2">
            {draft.mats.map((m, i) => {
              const lenTracked = isLengthTracked(unitOf(m.materialId));
              return (
              <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
                <select className={inp + " flex-1 basis-full sm:basis-0 min-w-[11rem]"} value={m.materialId}
                  onChange={(e) => updateMat(i, { materialId: e.target.value, qtyPerUnit: 1, cutLengthMm: 0 })}>
                  <option value="">- เลือกวัสดุ -</option>
                  {allMaterials.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.code ? `[${opt.code}] ` : ""}{opt.name}
                    </option>
                  ))}
                </select>
                {lenTracked ? (
                  <>
                    <input type="number" min={0} step="any" placeholder="ความยาว/หน่วย"
                      className={inp + " w-28 text-center shrink-0"}
                      value={m.cutLengthMm || ""}
                      onChange={(e) => updateMat(i, { qtyPerUnit: 1, cutLengthMm: Number(e.target.value) })} />
                    <span className="text-xs text-gray-500 w-12 shrink-0">mm/ตัว</span>
                  </>
                ) : (
                  <>
                    <input type="number" min={0} step="any" className={inp + " w-20 text-center shrink-0"}
                      value={m.qtyPerUnit}
                      onChange={(e) => updateMat(i, { qtyPerUnit: Number(e.target.value) })} />
                    <span className="text-xs text-gray-500 w-10 shrink-0">{unitOf(m.materialId)}</span>
                  </>
                )}
                <button type="button" onClick={() => removeMat(i)} className="text-red-600 text-sm px-1 shrink-0">✕</button>
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}
