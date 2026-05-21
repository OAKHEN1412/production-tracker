import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import JobForm from "@/components/JobForm";

export default async function NewJobPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as any).role;
  if (role !== "PRODUCTION" && role !== "OWNER" && role !== "SUPPORT") redirect("/");

  const users = await prisma.user.findMany({
    where: { role: "PRODUCTION" },
    select: { id: true, name: true, username: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-bold mb-4">สร้างงานผลิตใหม่</h1>
      <JobForm users={users} />
    </div>
  );
}
