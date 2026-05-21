import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import JobTable from "@/components/JobTable";
import StatsSidebar from "@/components/StatsSidebar";
import { computeOverall, computeWorkers } from "@/lib/stats";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [jobs, users] = await Promise.all([
    prisma.job.findMany({
      orderBy: { seq: "asc" },
      include: {
        assignedTo: { select: { id: true, name: true, username: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "PRODUCTION" },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const role = (session.user as any).role as "OWNER" | "PRODUCTION" | "SALES";
  const canEdit = role === "PRODUCTION" || role === "OWNER";

  const overall = computeOverall(jobs as any);
  const workers = computeWorkers(jobs as any);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">ตารางการผลิต</h1>
          {canEdit && <p className="text-xs text-gray-500">💡 ดับเบิลคลิกที่แถวเพื่อแก้ไขเร็ว</p>}
        </div>
        <div className="text-xs sm:text-sm text-gray-600">
          role: <b>{role}</b> {role === "SALES" && "(read-only)"}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1 min-w-0">
          <JobTable jobs={JSON.parse(JSON.stringify(jobs))} users={users} canEdit={canEdit} />
        </div>
        <StatsSidebar overall={overall} workers={workers} />
      </div>
    </div>
  );
}
