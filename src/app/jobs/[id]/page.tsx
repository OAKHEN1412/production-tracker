import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import JobForm from "@/components/JobForm";
import { STATUS_LABEL, STATUS_COLOR, type Status } from "@/lib/eta";
import { isLengthTracked } from "@/lib/materials";

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const role = (session.user as any).role;

  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: {
      assignedTo: { select: { id: true, name: true, username: true } },
      createdBy: { select: { name: true } },
      logs: { orderBy: { createdAt: "desc" }, take: 20 },
      materials: { include: { material: { select: { id: true, name: true, unit: true, code: true } } } },
      assemblies: true,
    },
  });
  if (!job) notFound();

  const [users, salesUsers, allMaterials, products] = await Promise.all([
    prisma.user.findMany({
      where: { role: "PRODUCTION" },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "SALES" },
      select: { id: true, name: true, username: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      select: { id: true, name: true, unit: true, code: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, code: true, cutAllowanceMm: true,
        materials: { select: { materialId: true, qtyPerUnit: true, cutLengthMm: true } },
        assemblies: { select: { name: true, qty: true } },
      },
    }),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">
        งาน #{job.seq} — {job.docNo}{" "}
        <span className={`ml-2 text-xs px-2 py-0.5 rounded ${STATUS_COLOR[job.status as Status]}`}>
          {STATUS_LABEL[job.status as Status]}
        </span>
      </h1>
      <div className="text-xs text-gray-500 -mt-2">ผู้สร้างงาน: {job.createdBy?.name ?? "-"}</div>

      {(role === "PRODUCTION" || role === "OWNER") ? (
        <JobForm users={users} salesUsers={salesUsers} allMaterials={allMaterials} products={products} initial={JSON.parse(JSON.stringify(job))} />
      ) : (
        <div className="bg-white p-4 rounded shadow text-sm space-y-1">
          <div><b>ลูกค้า:</b> {job.customer}</div>
          <div><b>รายการ:</b> {job.item}</div>
          <div><b>จำนวน:</b> {job.qty}</div>
          <div><b>Delivery:</b> {job.deliveryTime}</div>
          <div><b>ผู้รับผิดชอบ:</b> {job.assignedTo?.name ?? "-"}</div>
          <div><b>ETA auto:</b> {job.etaAuto ? new Date(job.etaAuto).toLocaleString("th-TH") : "-"}</div>
          <div><b>ETA manual:</b> {job.etaManual ? new Date(job.etaManual).toLocaleDateString("th-TH") : "-"}</div>
          <div><b>หมายเหตุ:</b> {job.notes ?? "-"}</div>
          {job.materials.length > 0 && (
            <div>
              <b>วัสดุที่ใช้ (ต่อชิ้น):</b>
              <ul className="list-disc ml-5 mt-1">
                {job.materials.map((jm) => (
                  <li key={jm.id}>
                    {jm.material.code ? `[${jm.material.code}] ` : ""}{jm.material.name} —{" "}
                    {isLengthTracked(jm.material.unit) && jm.cutLengthMm > 0
                      ? `${jm.qtyPerUnit} เส้น × ${jm.cutLengthMm} mm/ตัว`
                      : `${jm.qtyPerUnit} ${jm.material.unit}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {job.assemblies.length > 0 && (
            <div>
              <b>ชุดประกอบ (ส่งให้ฝ่ายจัดส่ง):</b>
              <ul className="list-disc ml-5 mt-1">
                {job.assemblies.map((a) => (
                  <li key={a.id}>{a.name} — {a.qty} ชุด/ตัว (รวม {a.qty * job.qty})</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="bg-white p-4 rounded shadow">
        <h2 className="font-semibold mb-2">ประวัติสถานะ</h2>
        <ul className="text-sm space-y-1">
          {job.logs.map((l) => (
            <li key={l.id} className="border-b py-1">
              <span className="text-gray-500 mr-2">
                {new Date(l.createdAt).toLocaleString("th-TH")}
              </span>
              <span className="font-mono">{l.status}</span>
              {l.message && <span className="text-gray-600"> — {l.message}</span>}
            </li>
          ))}
          {job.logs.length === 0 && <li className="text-gray-500">ไม่มีประวัติ</li>}
        </ul>
      </div>
    </div>
  );
}
