import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.findUnique({ where: { username: "owner@autocluster.com" } });
  if (!owner) throw new Error("owner not found");

  for (const username of ["production", "worker1"]) {
    const u = await prisma.user.findUnique({ where: { username } });
    if (!u) continue;
    // unlink assignedTo
    await prisma.job.updateMany({
      where: { assignedToId: u.id },
      data: { assignedToId: null },
    });
    // reassign createdBy to owner
    await prisma.job.updateMany({
      where: { createdById: u.id },
      data: { createdById: owner.id },
    });
    await prisma.user.delete({ where: { id: u.id } });
    console.log(`deleted: ${username}`);
  }
}

main().finally(() => prisma.$disconnect());
