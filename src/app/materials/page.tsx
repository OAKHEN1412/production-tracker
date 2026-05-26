import { getServerSession } from "next-auth";
import { authOptions, canEditMaterials } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import MaterialsTable from "@/components/MaterialsTable";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const materials = await prisma.material.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { lengths: { orderBy: { lengthMm: "desc" } } },
  });

  const role = (session.user as any).role as string;
  const canEdit = canEditMaterials(role);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">สต๊อกวัสดุการผลิต</h1>
          <p className="text-xs text-gray-500">วัสดุสำหรับผลิตกระบอกลม — ตัดสต๊อกอัตโนมัติเมื่องานเสร็จ</p>
        </div>
        <div className="text-xs sm:text-sm text-gray-600">
          role: <b>{role}</b> {!canEdit && "(read-only)"}
        </div>
      </div>
      <MaterialsTable materials={JSON.parse(JSON.stringify(materials))} canEdit={canEdit} />
    </div>
  );
}
