import { getServerSession } from "next-auth";
import { authOptions, canFullEdit } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProductsTable from "@/components/ProductsTable";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [products, allMaterials] = await Promise.all([
    prisma.product.findMany({
      orderBy: { name: "asc" },
      include: {
        materials: { include: { material: { select: { id: true, name: true, unit: true, code: true } } } },
        assemblies: true,
      },
    }),
    prisma.material.findMany({
      select: { id: true, name: true, unit: true, code: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);

  const role = (session.user as any).role as string;
  const canEdit = canFullEdit(role);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">รุ่นกระบอก (สูตรการผลิต)</h1>
          <p className="text-xs text-gray-500">ตั้งค่าว่าแต่ละรุ่นใช้วัสดุอะไรบ้างต่อ 1 กระบอก — เลือกใช้ได้ตอนสร้างงานใหม่</p>
        </div>
        <div className="text-xs sm:text-sm text-gray-600">
          role: <b>{role}</b> {!canEdit && "(read-only)"}
        </div>
      </div>
      <ProductsTable
        products={JSON.parse(JSON.stringify(products))}
        allMaterials={allMaterials}
        canEdit={canEdit}
      />
    </div>
  );
}
