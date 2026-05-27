import { prisma } from "./prisma";
import { isLengthTracked } from "./materials";

type MatRow = { materialId: string; qtyPerUnit: number; cutLengthMm?: number };
type BomRow = { qtyPerUnit: number; cutLengthMm: number };
type Bom = Map<string, BomRow>;

// Thrown when a length-tracked material can't be cut because no stock เส้น is
// long enough. Routes catch this and return a 400 with the message.
export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

// ── Length-tracked stock (TUBE/ROD) ────────────────────────────────────────
// A length-tracked material keeps a breakdown of how many เส้น it has at each
// length (MaterialLength rows, mm). Material.qty stays the total piece count
// (sum of the breakdown), so existing count-based logic (low-stock) keeps
// working. lengthMm = 0 means "unknown length".

// Add `count` pieces of length `lengthMm` to a material and bump its total qty.
export async function addPieces(materialId: string, lengthMm: number, count: number) {
  if (count <= 0) return;
  const key = Number.isFinite(lengthMm) && lengthMm > 0 ? lengthMm : 0;
  await prisma.$transaction([
    prisma.materialLength.upsert({
      where: { materialId_lengthMm: { materialId, lengthMm: key } },
      create: { materialId, lengthMm: key, qty: count },
      update: { qty: { increment: count } },
    }),
    prisma.material.update({ where: { id: materialId }, data: { qty: { increment: count } } }),
  ]);
}

// Remove `count` pieces at a specific length (manual เบิกออก of known length).
export async function removePiecesAtLength(materialId: string, lengthMm: number, count: number) {
  if (count <= 0) return 0;
  const key = Number.isFinite(lengthMm) && lengthMm > 0 ? lengthMm : 0;
  const bucket = await prisma.materialLength.findUnique({
    where: { materialId_lengthMm: { materialId, lengthMm: key } },
  });
  // Can't issue more pieces than the named length actually holds. Clamp to what's
  // there and decrement Material.qty by the SAME amount, so the total stays equal
  // to the sum of the length breakdown (the invariant the rest of stock relies on).
  const remove = bucket ? Math.min(count, bucket.qty) : 0;
  if (remove <= 0) return 0;
  const ops: any[] = [];
  if (remove >= bucket!.qty) {
    ops.push(prisma.materialLength.delete({ where: { id: bucket!.id } }));
  } else {
    ops.push(prisma.materialLength.update({ where: { id: bucket!.id }, data: { qty: { decrement: remove } } }));
  }
  ops.push(prisma.material.update({ where: { id: materialId }, data: { qty: { decrement: remove } } }));
  await prisma.$transaction(ops);
  return remove;
}

// Make the length breakdown match Material.qty after a count-only change
// (production deduction / restore for materials WITHOUT a specified cut length).
// Trims shortest pieces first when stock drops; pads an "unknown length" (0)
// bucket when stock returns. No-op for non length-tracked units.
export async function syncMaterialBuckets(materialId: string) {
  const m = await prisma.material.findUnique({
    where: { id: materialId },
    include: { lengths: { orderBy: { lengthMm: "asc" } } },
  });
  if (!m || !isLengthTracked(m.unit)) return;

  const sum = m.lengths.reduce((s, b) => s + b.qty, 0);
  let diff = m.qty - sum; // >0 need to add (unknown), <0 need to trim
  if (diff === 0) return;

  const ops: any[] = [];
  if (diff > 0) {
    const zero = m.lengths.find((b) => b.lengthMm === 0);
    if (zero) ops.push(prisma.materialLength.update({ where: { id: zero.id }, data: { qty: { increment: diff } } }));
    else ops.push(prisma.materialLength.create({ data: { materialId, lengthMm: 0, qty: diff } }));
  } else {
    let toTrim = -diff;
    for (const b of m.lengths) {
      if (toTrim <= 0) break;
      const take = Math.min(toTrim, b.qty);
      if (take >= b.qty) ops.push(prisma.materialLength.delete({ where: { id: b.id } }));
      else ops.push(prisma.materialLength.update({ where: { id: b.id }, data: { qty: { decrement: take } } }));
      toTrim -= take;
    }
  }
  if (ops.length) await prisma.$transaction(ops);
}

// ── In-memory length-bucket helpers (used to plan cuts before writing) ──────

// Cut `pieces` cuts of length `L` from a bucket map using best-fit: the smallest
// stock เส้น that is still ≥ L. The cut piece leaves stock (goes into the product);
// any remainder of the cut เส้น returns as an offcut bucket. lengthMm 0 = unknown,
// not cuttable. Throws InsufficientStockError if a piece can't be cut.
export function cutFromBuckets(buckets: Map<number, number>, L: number, pieces: number, label: string) {
  for (let i = 0; i < pieces; i++) {
    let best = -1;
    for (const [len, q] of buckets) {
      if (len > 0 && q > 0 && len >= L && (best === -1 || len < best)) best = len;
    }
    if (best === -1) {
      throw new InsufficientStockError(
        `วัสดุ "${label}" มีเส้นยาวไม่พอตัด ${L} mm (ขาดอีก ${pieces - i} ชิ้น)`
      );
    }
    buckets.set(best, (buckets.get(best) ?? 0) - 1);
    const rem = Math.round((best - L) * 1e6) / 1e6;
    if (rem > 0) buckets.set(rem, (buckets.get(rem) ?? 0) + 1);
  }
}

// Return `pieces` cut offcuts of length `L` to a bucket map (restore on cancel).
export function addBackBuckets(buckets: Map<number, number>, L: number, pieces: number) {
  const key = L > 0 ? L : 0;
  buckets.set(key, (buckets.get(key) ?? 0) + pieces);
}

async function loadBuckets(materialId: string): Promise<Map<number, number>> {
  const rows = await prisma.materialLength.findMany({
    where: { materialId },
    select: { lengthMm: true, qty: true },
  });
  const m = new Map<number, number>();
  for (const r of rows) m.set(r.lengthMm, (m.get(r.lengthMm) ?? 0) + r.qty);
  return m;
}

// Clean + de-dup a bill-of-materials list into a Map<materialId, BomRow>.
// Drops empty materialIds and non-positive usage; last write wins on duplicate ids.
function toBom(materials: MatRow[]): Bom {
  const m: Bom = new Map();
  for (const row of materials) {
    if (row.materialId && row.qtyPerUnit > 0) {
      m.set(row.materialId, { qtyPerUnit: row.qtyPerUnit, cutLengthMm: row.cutLengthMm ?? 0 });
    }
  }
  return m;
}

// Reconcile a job's material stock to match a target bill-of-materials × qty.
//
// Two deduction models live here:
//  - COUNT (default, incl. length-tracked materials with no cut length): adjust
//    Material.qty by the piece delta, then sync the length breakdown.
//  - LENGTH-CUT (length-tracked material with cutLengthMm > 0): physically cut
//    `pieces` × cutLengthMm from the longest-enough เส้น (best-fit), leaving the
//    remainder as an offcut. Cancelling returns the cut pieces as offcuts.
//
// Edits are handled by "restore the old deduction, then apply the new one", so a
// qty change / material swap / cancel / reactivate all reduce to the same path.
// Length-cut feasibility is checked BEFORE any write, so an impossible cut aborts
// the whole reconcile (throws InsufficientStockError) without touching stock.
export async function reconcileJobMaterials(params: {
  jobId: string;
  oldQty: number;
  oldDeducted: boolean;
  oldMaterials: MatRow[];
  newQty: number;
  newMaterials: MatRow[];
  cancelled?: boolean;
  statusForLog?: string;
}) {
  const { jobId, oldQty, oldDeducted, oldMaterials, newQty, newMaterials, cancelled, statusForLog } = params;

  const newBom = toBom(newMaterials);
  const oldBom = toBom(oldMaterials);
  const shouldDeduct = newBom.size > 0 && !cancelled;

  const ids = new Set<string>([
    ...oldMaterials.map((r) => r.materialId).filter(Boolean),
    ...newBom.keys(),
  ]);

  const mats = ids.size
    ? await prisma.material.findMany({ where: { id: { in: [...ids] } }, select: { id: true, unit: true, name: true } })
    : [];
  const unitById = new Map(mats.map((m) => [m.id, m.unit]));
  const nameById = new Map(mats.map((m) => [m.id, m.name]));

  // A material uses the cut path if it's length-tracked and a cut length is set
  // on either the old (already-deducted) or the new side.
  const lengthCutIds = new Set<string>();
  for (const id of ids) {
    if (!isLengthTracked(unitById.get(id))) continue;
    const oldCut = oldDeducted ? oldBom.get(id)?.cutLengthMm ?? 0 : 0;
    const newCut = shouldDeduct ? newBom.get(id)?.cutLengthMm ?? 0 : 0;
    if (oldCut > 0 || newCut > 0) lengthCutIds.add(id);
  }

  // ── COUNT path: net delta on Material.qty (skips length-cut materials) ──
  const oldDeduction = new Map<string, number>();
  if (oldDeducted) {
    for (const row of oldMaterials) {
      if (row.materialId && !lengthCutIds.has(row.materialId)) {
        oldDeduction.set(row.materialId, (oldDeduction.get(row.materialId) ?? 0) + row.qtyPerUnit * oldQty);
      }
    }
  }
  const newDeduction = new Map<string, number>();
  if (shouldDeduct) {
    for (const [id, row] of newBom) {
      if (!lengthCutIds.has(id)) newDeduction.set(id, row.qtyPerUnit * newQty);
    }
  }
  const countIds = new Set<string>([...oldDeduction.keys(), ...newDeduction.keys()]);
  const stockOps: any[] = [];
  let moved = false;
  for (const id of countIds) {
    const delta = (newDeduction.get(id) ?? 0) - (oldDeduction.get(id) ?? 0);
    if (delta !== 0) {
      moved = true;
      stockOps.push(prisma.material.update({ where: { id }, data: { qty: { decrement: delta } } }));
    }
  }

  // ── LENGTH-CUT path: simulate (restore old → apply new) to a final bucket
  // state. Throws here, before any write, if a cut can't be satisfied. ──
  const cutPlans: { id: string; buckets: Map<number, number>; total: number }[] = [];
  for (const id of lengthCutIds) {
    const buckets = await loadBuckets(id);
    if (oldDeducted) {
      const orow = oldBom.get(id);
      if (orow) {
        const oldPieces = orow.qtyPerUnit * oldQty;
        if (oldPieces > 0) addBackBuckets(buckets, orow.cutLengthMm, oldPieces);
      }
    }
    if (shouldDeduct) {
      const nrow = newBom.get(id);
      if (nrow) {
        const newPieces = nrow.qtyPerUnit * newQty;
        if (newPieces > 0) cutFromBuckets(buckets, nrow.cutLengthMm, newPieces, nameById.get(id) ?? id);
      }
    }
    const total = [...buckets.values()].reduce((s, q) => s + q, 0);
    cutPlans.push({ id, buckets, total });
    moved = true;
  }

  // ── Write: BOM rows + count-stock deltas + flag + log (one transaction) ──
  const ops: any[] = [prisma.jobMaterial.deleteMany({ where: { jobId } })];
  if (newBom.size) {
    ops.push(
      prisma.jobMaterial.createMany({
        data: Array.from(newBom, ([materialId, row]) => ({
          jobId, materialId, qtyPerUnit: row.qtyPerUnit, cutLengthMm: row.cutLengthMm,
        })),
      })
    );
  }
  ops.push(...stockOps);
  ops.push(prisma.job.update({ where: { id: jobId }, data: { materialsDeducted: shouldDeduct } }));
  if (moved) {
    ops.push(
      prisma.jobLog.create({
        data: { jobId, status: statusForLog ?? "", message: "ปรับสต๊อกวัสดุตามงานผลิต" },
      })
    );
  }
  await prisma.$transaction(ops);

  // Count length-tracked materials: keep the breakdown in step with the new total.
  for (const id of countIds) {
    const delta = (newDeduction.get(id) ?? 0) - (oldDeduction.get(id) ?? 0);
    if (delta !== 0) await syncMaterialBuckets(id);
  }
  // Length-cut materials: write the planned breakdown + total.
  for (const plan of cutPlans) {
    const data = [...plan.buckets].filter(([, q]) => q !== 0).map(([lengthMm, qty]) => ({ materialId: plan.id, lengthMm, qty }));
    const rewrite: any[] = [prisma.materialLength.deleteMany({ where: { materialId: plan.id } })];
    if (data.length) rewrite.push(prisma.materialLength.createMany({ data }));
    rewrite.push(prisma.material.update({ where: { id: plan.id }, data: { qty: plan.total } }));
    await prisma.$transaction(rewrite);
  }
}

// Put deducted stock back (e.g. when a job is deleted). No-op if never deducted.
// Count materials add their pieces back; length-cut materials return their cut
// pieces as offcuts of the cut length.
export async function restoreDeductedMaterials(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { materials: { include: { material: { select: { unit: true } } } } },
  });
  if (!job || !job.materialsDeducted || job.materials.length === 0) return;

  const cutMats = job.materials.filter((jm) => isLengthTracked(jm.material.unit) && jm.cutLengthMm > 0);
  const countMats = job.materials.filter((jm) => !(isLengthTracked(jm.material.unit) && jm.cutLengthMm > 0));

  await prisma.$transaction([
    ...countMats.map((jm) =>
      prisma.material.update({
        where: { id: jm.materialId },
        data: { qty: { increment: jm.qtyPerUnit * job.qty } },
      })
    ),
    prisma.job.update({ where: { id: jobId }, data: { materialsDeducted: false } }),
  ]);

  for (const jm of countMats) {
    if (isLengthTracked(jm.material.unit)) await syncMaterialBuckets(jm.materialId);
  }
  // Cut materials: cut pieces come back as offcuts of length cutLengthMm.
  for (const jm of cutMats) await addPieces(jm.materialId, jm.cutLengthMm, jm.qtyPerUnit * job.qty);
}

type AsmRow = { name: string; qty: number };

// Clean an assembly list: drop blank names / non-positive qty, trim, floor qty.
function cleanAssemblies(rows: AsmRow[]): AsmRow[] {
  const out: AsmRow[] = [];
  for (const r of rows ?? []) {
    const name = (r?.name ?? "").trim();
    const qty = Math.floor(Number(r?.qty));
    if (name && Number.isFinite(qty) && qty > 0) out.push({ name, qty });
  }
  return out;
}

// Replace a product's assembly list (ชุดประกอบ). No stock — just parts to ship.
export async function setProductAssemblies(productId: string, assemblies: AsmRow[]) {
  const rows = cleanAssemblies(assemblies);
  await prisma.$transaction([
    prisma.productAssembly.deleteMany({ where: { productId } }),
    ...(rows.length ? [prisma.productAssembly.createMany({ data: rows.map((r) => ({ productId, name: r.name, qty: r.qty })) })] : []),
  ]);
}

// Replace a job's assembly list (copied from its model when selected).
export async function setJobAssemblies(jobId: string, assemblies: AsmRow[]) {
  const rows = cleanAssemblies(assemblies);
  await prisma.$transaction([
    prisma.jobAssembly.deleteMany({ where: { jobId } }),
    ...(rows.length ? [prisma.jobAssembly.createMany({ data: rows.map((r) => ({ jobId, name: r.name, qty: r.qty })) })] : []),
  ]);
}

// Replace a product's (cylinder model) recipe. Pass [] to clear.
// Products carry no stock, so this only rewrites the recipe rows.
export async function setProductMaterials(productId: string, materials: MatRow[]) {
  const byId = toBom(materials);

  await prisma.$transaction([
    prisma.productMaterial.deleteMany({ where: { productId } }),
    ...(byId.size
      ? [
          prisma.productMaterial.createMany({
            data: Array.from(byId, ([materialId, row]) => ({
              productId, materialId, qtyPerUnit: row.qtyPerUnit, cutLengthMm: row.cutLengthMm,
            })),
          }),
        ]
      : []),
  ]);
}
