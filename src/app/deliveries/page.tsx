import { getServerSession } from "next-auth";
import { authOptions, canReceiveStock } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DeliveriesView from "@/components/DeliveriesView";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [deliveries, materials] = await Promise.all([
    prisma.delivery.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, title: true, note: true, qtyReceived: true, materialId: true, createdAt: true,
        material: { select: { name: true, unit: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.material.findMany({
      select: { id: true, name: true, unit: true, code: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
  ]);

  const role = (session.user as any).role as string;
  const canReceive = canReceiveStock(role);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">รับพัสดุเข้าคลัง</h1>
          <p className="text-xs text-gray-500">ยืนยันการส่งของด้วยรูปถ่าย — เลือกวัสดุเพื่อบวกเข้าสต๊อก</p>
        </div>
        <div className="text-xs sm:text-sm text-gray-600">
          role: <b>{role}</b> {!canReceive && "(read-only)"}
        </div>
      </div>
      <DeliveriesView
        deliveries={JSON.parse(JSON.stringify(deliveries))}
        materials={materials}
        canReceive={canReceive}
      />
    </div>
  );
}
