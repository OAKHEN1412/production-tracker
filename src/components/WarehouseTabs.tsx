"use client";
import { useState } from "react";
import MaterialsTable from "./MaterialsTable";
import DeliveriesView from "./DeliveriesView";
import type { Material } from "@/lib/materials";

type MaterialOpt = { id: string; name: string; unit: string; code: string | null };

// One "คลัง" page with two tabs — stock master and receiving — so the warehouse
// lives behind a single nav entry instead of two overlapping pages.
export default function WarehouseTabs({
  materials,
  materialOpts,
  deliveries,
  canEditMaterials,
  canReceive,
  initialTab = "stock",
}: {
  materials: Material[];
  materialOpts: MaterialOpt[];
  deliveries: any[];
  canEditMaterials: boolean;
  canReceive: boolean;
  initialTab?: "stock" | "receive";
}) {
  const [tab, setTab] = useState<"stock" | "receive">(initialTab);

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
      active ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div>
      <div className="flex border-b mb-3">
        <button className={tabCls(tab === "stock")} onClick={() => setTab("stock")}>📦 สต๊อกวัสดุ</button>
        <button className={tabCls(tab === "receive")} onClick={() => setTab("receive")}>🚚 รับเข้าคลัง</button>
      </div>

      {tab === "stock" ? (
        <MaterialsTable materials={materials} canEdit={canEditMaterials} />
      ) : (
        <DeliveriesView deliveries={deliveries} materials={materialOpts} canReceive={canReceive} />
      )}
    </div>
  );
}
