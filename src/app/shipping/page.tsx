import { getServerSession } from "next-auth";
import { authOptions, canShip } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ShippingView from "@/components/ShippingView";

export const dynamic = "force-dynamic";

export default async function ShippingPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as any).role as string;
  if (!canShip(role)) redirect("/");

  // Shipping queue = jobs PRODUCTION approved that are waiting for the equipment to
  // be delivered to the factory (status รอจัดส่ง). Confirming delivery (+ photo)
  // releases the job to production (รอผลิต).
  const [queue, shipments] = await Promise.all([
    prisma.job.findMany({
      where: { status: "AWAITING_DELIVERY", cancelled: false },
      orderBy: { createdAt: "asc" },
      include: {
        assignedTo: { select: { name: true } },
        salesOwner: { select: { name: true } },
        assemblies: { select: { name: true, qty: true } },
      },
    }),
    prisma.shipment.findMany({
      orderBy: { shippedAt: "desc" },
      take: 100,
      select: {
        id: true, note: true, shippedAt: true,
        job: { select: { seq: true, docNo: true, customer: true, item: true, qty: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  const initialTab = searchParams.tab === "history" ? "history" : "queue";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">จัดส่ง</h1>
          <p className="text-xs text-gray-500">งานรอจัดส่ง (ฝ่ายผลิตอนุมัติแล้ว) → ยืนยันมาส่งของพร้อมรูป → รอผลิต</p>
        </div>
        <div className="text-xs sm:text-sm text-gray-600">role: <b>{role}</b></div>
      </div>
      <ShippingView
        queue={JSON.parse(JSON.stringify(queue))}
        shipments={JSON.parse(JSON.stringify(shipments))}
        initialTab={initialTab}
      />
    </div>
  );
}
