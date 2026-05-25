import { prisma } from "./prisma";

// Deduct material stock for a job's bill-of-materials exactly once.
// Called whenever a job has materials (on create / when materials are set / on DONE).
// Guarded by Job.materialsDeducted so repeated calls never double-deduct.
// Usage deducted per material = qtyPerUnit * job.qty.
// No materials yet → do nothing (and do NOT set the flag, so a later edit that
// adds materials can still deduct).
export async function deductMaterialsOnce(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { materials: true },
  });
  if (!job || job.materialsDeducted) return;
  if (job.materials.length === 0) return;

  await prisma.$transaction([
    ...job.materials.map((jm) =>
      prisma.material.update({
        where: { id: jm.materialId },
        data: { qty: { decrement: jm.qtyPerUnit * job.qty } },
      })
    ),
    prisma.job.update({ where: { id: jobId }, data: { materialsDeducted: true } }),
    prisma.jobLog.create({
      data: { jobId, status: job.status, message: "ตัดสต๊อกวัสดุตามงานผลิต" },
    }),
  ]);
}

// Put deducted stock back (e.g. when a job is deleted). No-op if never deducted.
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

// Replace a job's bill-of-materials. Pass [] to clear.
export async function setJobMaterials(
  jobId: string,
  materials: { materialId: string; qtyPerUnit: number }[]
) {
  // Drop entries with no material or non-positive usage.
  const clean = materials.filter((m) => m.materialId && m.qtyPerUnit > 0);
  // De-dup by materialId (schema has a unique [jobId, materialId]).
  const byId = new Map(clean.map((m) => [m.materialId, m.qtyPerUnit]));

  await prisma.$transaction([
    prisma.jobMaterial.deleteMany({ where: { jobId } }),
    ...(byId.size
      ? [
          prisma.jobMaterial.createMany({
            data: Array.from(byId, ([materialId, qtyPerUnit]) => ({ jobId, materialId, qtyPerUnit })),
          }),
        ]
      : []),
  ]);
}

// Replace a product's (cylinder model) recipe. Pass [] to clear.
export async function setProductMaterials(
  productId: string,
  materials: { materialId: string; qtyPerUnit: number }[]
) {
  const clean = materials.filter((m) => m.materialId && m.qtyPerUnit > 0);
  const byId = new Map(clean.map((m) => [m.materialId, m.qtyPerUnit]));

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
