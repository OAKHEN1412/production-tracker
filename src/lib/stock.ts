import { prisma } from "./prisma";

// Deduct material stock for a job's bill-of-materials exactly once.
// Called when a job reaches DONE. Guarded by Job.materialsDeducted so repeated
// calls (e.g. editing a DONE job) never double-deduct.
// Usage deducted per material = qtyPerUnit * job.qty.
export async function deductMaterialsOnce(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { materials: true },
  });
  if (!job || job.materialsDeducted) return;

  if (job.materials.length === 0) {
    await prisma.job.update({ where: { id: jobId }, data: { materialsDeducted: true } });
    return;
  }

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
