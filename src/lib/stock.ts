import { prisma } from "./prisma";

type MatRow = { materialId: string; qtyPerUnit: number };

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
