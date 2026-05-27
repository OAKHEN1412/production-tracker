import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ProfileForm from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
    select: { id: true, name: true, username: true, role: true },
  });
  if (!me) redirect("/login");

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-lg sm:text-xl font-bold mb-1">โปรไฟล์ของฉัน</h1>
      <p className="text-xs text-gray-500 mb-3">แก้ชื่อ / อีเมล (ชื่อผู้ใช้) / รหัสผ่านของตัวเอง</p>
      <ProfileForm me={me} />
    </div>
  );
}
