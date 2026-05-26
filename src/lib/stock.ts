import { prisma } from "./prisma";
import { isLengthTracked } from "./materials";

type MatRow = { materialId: string; qtyPerUnit: number };

// ── Length-tracked stock (TUBE/ROD) ────────────────────────────────────────
// A length-tracked material keeps a breakdown of how many เส้น it has at each
// length (MaterialLength rows, mm). Material.qty stays the total piece count
// (sum of the breakdown), so existing count-based logic (low-stock, production
// deduction) keeps working. lengthMm = 0 means "unknown length".

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
  if (count <= 0) return;
  const key = Number.isFinite(lengthMm) && lengthMm > 0 ? lengthMm : 0;
  const bucket = await prisma.materialLength.findUnique({
    where: { materialId_lengthMm: { materialId, lengthMm: key } },
  });
  const remove = bucket ? Math.min(count, bucket.qty) : 0;
  const ops: any[] = [];
  if (bucket) {
    if (bucket.qty - count <= 0) {
      ops.push(prisma.materialLength.delete({ where: { id: bucket.id } }));
    } else {
      ops.push(prisma.materialLength.update({ where: { id: bucket.id }, data: { qty: { decrement: count } } }));
    }
  }
  // Always reflect the requested change on the total (even if no bucket existed).
  ops.push(prisma.material.update({ where: { id: materialId }, data: { qty: { decrement: count } } }));
  await prisma.$transaction(ops);
  return remove;
}

// Make the length breakdown match Material.qty after a count-only change
// (production deduction / restore). Trims shortest pieces first when stock drops;
// pads an "unknown length" (0) bucket when stock returns. No-op for non
// length-tracked units so plain count materials never grow phantom buckets.
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

// Clean + de-dup a bill-of-materials list into a Map<materialId, qtyPerUnit>.
// Drops empty materialIds and non-positive usage; last write wins on duplicate ids.
function toBom(materials: MatRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of materials) {
    if (row.materialId && row.qtyPerUnit > 0) m.set(row.materialId, row.qtyPerUnit);
  }
  return m;
}

// Reconcile a job's material stock to match a target bill-of-materials × qty.
//
// This replaces the old "deduct exactly once" model, which could not handle a
// job being edited after its stock was already deducted (qty change, or a
// material added / removed / changed). Instead we compute the DELTA between what
// was previously removed from stock and what the new state should remove, then
// apply only that difference — atomically, alongside rewriting the BOM rows.
//
// Invariant kept by always routing edits through here: when Job.materialsDeducted
// is true, the amount removed from stock equals (current BOM) × (current qty).
// That lets restoreDeductedMaterials() simply add back the current BOM × qty.
//
// shouldDeduct target = "the job has materials AND is not cancelled". A cancelled
// job gives its stock back; reactivating it deducts again — all via the same delta.
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
  const shouldDeduct = newBom.size > 0 && !cancelled;

  // What was previously removed from stock (old BOM × old qty), if deducted.
  const oldDeduction = new Map<string, number>();
  if (oldDeducted) {
    for (const row of oldMaterials) {
      oldDeduction.set(row.materialId, (oldDeduction.get(row.materialId) ?? 0) + row.qtyPerUnit * oldQty);
    }
  }
  // What should be removed from stock now (new BOM × new qty).
  const newDeduction = new Map<string, number>();
  if (shouldDeduct) {
    for (const [materialId, qtyPerUnit] of newBom) {
      newDeduction.set(materialId, qtyPerUnit * newQty);
    }
  }

  // Net delta per material = new - old. Positive → decrement more; negative → give back.
  const ids = new Set<string>([...oldDeduction.keys(), ...newDeduction.keys()]);
  const stockOps = [];
  let moved = false;
  for (const id of ids) {
    const delta = (newDeduction.get(id) ?? 0) - (oldDeduction.get(id) ?? 0);
    if (delta !== 0) {
      moved = true;
      stockOps.push(
        prisma.material.update({ where: { id }, data: { qty: { decrement: delta } } })
      );
    }
  }

  // deleteMany must precede createMany (unique [jobId, materialId]).
  const ops: any[] = [prisma.jobMaterial.deleteMany({ where: { jobId } })];
  if (newBom.size) {
    ops.push(
      prisma.jobMaterial.createMany({
        data: Array.from(newBom, ([materialId, qtyPerUnit]) => ({ jobId, materialId, qtyPerUnit })),
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

  // Keep the per-length breakdown in step with the new total for any
  // length-tracked material whose count just changed.
  for (const id of ids) {
    const delta = (newDeduction.get(id) ?? 0) - (oldDeduction.get(id) ?? 0);
    if (delta !== 0) await syncMaterialBuckets(id);
  }
}

// Put deducted stock back (e.g. when a job is deleted). No-op if never deducted.
// Safe because reconcileJobMaterials keeps deducted stock == current BOM × qty.
export async function restoreDeductedMaterials(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { materials: true },
  });
  if (!job || !job.materialsDeducted || job.materials.length === 0) return;

  await prisma.$transaction([
    ...job.materials.map((jm) =>
      prisma.material.update({
        where: { id: jm.materialId },
        data: { qty: { increment: jm.qtyPerUnit * job.qty } },
      })
    ),
    prisma.job.update({ where: { id: jobId }, data: { materialsDeducted: false } }),
  ]);

  // Sync length breakdowns for the restored materials (adds to "unknown" bucket).
  for (const jm of job.materials) await syncMaterialBuckets(jm.materialId);
}

// Replace a product's (cylinder model) recipe. Pass [] to clear.
// Products carry no stock, so this only rewrites the recipe rows.
export async function setProductMaterials(
  productId: string,
  materials: MatRow[]
) {
  const byId = toBom(materials);

  await prisma.$transaction([
    prisma.productMaterial.deleteMany({ where: { productId } }),
    ...(byId.size
      ? [
          prisma.productMaterial.createMany({
            data: Array.from(byId, ([materialId, qtyPerUnit]) => ({ productId, materialId, qtyPerUnit })),
          }),
        ]
      : []),
  ]);
}
