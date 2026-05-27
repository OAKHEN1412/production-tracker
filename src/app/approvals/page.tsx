import { getServerSession } from "next-auth";
import { authOptions, canFullEdit } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ApprovalsView from "@/components/ApprovalsView";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as any).role as string;
  // Only PRODUCTION / OWNER approve SUPPORT requests.
  if (!canFullEdit(role)) redirect("/");

  const [jobs, users, allMaterials, products] = await Promise.all([
    prisma.job.findMany({
      where: { status: "WAITING_APPROVAL", cancelled: false },
      orderBy: { createdAt: "asc" },
      include: {
        salesOwner: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "PRODUCTION" },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      select: { id: true, name: true, unit: true, code: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, code: true, cutAllowanceMm: true,
        materials: { select: { materialId: true, qtyPerUnit: true, cutLengthMm: true } },
        assemblies: { select: { name: true, qty: true } },
      },
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg sm:text-xl font-bold">คำขอรออนุมัติ</h1>
        <p className="text-xs text-gray-500">
          งานที่ SUPPORT แอดเข้ามา — เลือกช่าง + ระบุวัสดุ/รุ่นกระบอก แล้วอนุมัติเพื่อสั่งผลิต
        </p>
      </div>
      <ApprovalsView
        jobs={JSON.parse(JSON.stringify(jobs))}
        users={users}
        allMaterials={allMaterials}
        products={products}
      />
    </div>
  );
}
