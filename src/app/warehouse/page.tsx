import { getServerSession } from "next-auth";
import { authOptions, canEditMaterials, canReceiveStock } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import WarehouseTabs from "@/components/WarehouseTabs";

export const dynamic = "force-dynamic";

export default async function WarehousePage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [materials, deliveries] = await Promise.all([
    prisma.material.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { lengths: { orderBy: { lengthMm: "desc" } } },
    }),
    prisma.delivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, title: true, note: true, qtyReceived: true, materialId: true, createdAt: true,
        material: { select: { name: true, unit: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  const materialOpts = materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit, code: m.code }));
  const role = (session.user as any).role as string;
  const initialTab = searchParams.tab === "receive" ? "receive" : "stock";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">คลังวัสดุ</h1>
          <p className="text-xs text-gray-500">สต๊อกวัสดุการผลิต + รับพัสดุเข้าคลัง</p>
        </div>
        <div className="text-xs sm:text-sm text-gray-600">role: <b>{role}</b></div>
      </div>
      <WarehouseTabs
        materials={JSON.parse(JSON.stringify(materials))}
        materialOpts={materialOpts}
        deliveries={JSON.parse(JSON.stringify(deliveries))}
        canEditMaterials={canEditMaterials(role)}
        canReceive={canReceiveStock(role)}
        initialTab={initialTab}
      />
    </div>
  );
}
