import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.upsert({
    where: { username: "owner@autocluster.com" },
    update: { password: await bcrypt.hash("owner1234", 10), role: "OWNER" },
    create: {
      username: "owner@autocluster.com",
      password: await bcrypt.hash("owner1234", 10),
      name: "Owner",
      role: "OWNER",
    },
  });

  await prisma.user.upsert({
    where: { username: "sales" },
    update: {},
    create: {
      username: "sales",
      password: await bcrypt.hash("sales123", 10),
      name: "ฝ่ายขาย",
      role: "SALES",
    },
  });

  await prisma.user.upsert({
    where: { username: "chang_tee" },
    update: { name: "ช่างตี๋" },
    create: {
      username: "chang_tee",
      password: await bcrypt.hash("worker123", 10),
      name: "ช่างตี๋",
      role: "PRODUCTION",
    },
  });

  await prisma.user.upsert({
    where: { username: "chang_sak" },
    update: { name: "ช่างศัก" },
    create: {
      username: "chang_sak",
      password: await bcrypt.hash("worker123", 10),
      name: "ช่างศัก",
      role: "PRODUCTION",
    },
  });

  const count = await prisma.job.count();
  if (count === 0) {
    await prisma.job.createMany({
      data: [
        {
          seq: 1,
          docNo: "JU6901003",
          orderDate: new Date("2026-01-05"),
          deliveryTime: "3-5 วันทำการ",
          customer: "คิงส์ ปราจีน",
          item: "SC80X270S",
          qty: 6,
          status: "IN_PROGRESS",
          rate: 0.5,
          createdById: owner.id,
        },
        {
          seq: 2,
          docNo: "JU6901004",
          orderDate: new Date("2026-01-06"),
          deliveryTime: "3-5 วันทำการ",
          customer: "168 อิเล็กทริค",
          item: "MCQV3-11-80-550M",
          qty: 1,
          status: "PENDING",
          createdById: owner.id,
        },
      ],
    });
  }

  console.log("Seed done.");
}

main().finally(() => prisma.$disconnect());
