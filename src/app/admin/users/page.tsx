import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import UsersAdmin from "@/components/UsersAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if ((session.user as any).role !== "OWNER") redirect("/");

  const users = await prisma.user.findMany({
    select: { id: true, username: true, name: true, role: true, createdAt: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-bold mb-4">จัดการผู้ใช้</h1>
      <UsersAdmin initial={JSON.parse(JSON.stringify(users))} meId={(session.user as any).id} />
    </div>
  );
}
