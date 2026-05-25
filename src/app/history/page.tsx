import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import HistoryView from "@/components/HistoryView";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const jobs = await prisma.job.findMany({
    orderBy: { seq: "asc" },
    include: {
      assignedTo: { select: { id: true, name: true } },
      salesOwner: { select: { id: true, name: true } },
      logs: { orderBy: { createdAt: "asc" } },
    },
  });

  return (
    <div>
      <h1 className="text-lg sm:text-xl font-bold mb-1">ประวัติการผลิต</h1>
      <p className="text-xs text-gray-500 mb-3">เวลาที่ใช้ในแต่ละสถานะ คำนวณจากเวลาที่กดเปลี่ยนสถานะ</p>
      <HistoryView jobs={JSON.parse(JSON.stringify(jobs))} />
    </div>
  );
}
