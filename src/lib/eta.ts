// ETA calculator
// rate = units per hour
// returns ISO Date estimating finish time
export function computeAutoEta(opts: {
  qty: number;
  rate?: number | null;
  startedAt?: Date | null;
  hoursPerDay?: number;
}): Date | null {
  const { qty, rate, startedAt } = opts;
  if (!rate || rate <= 0 || !qty || qty <= 0) return null;
  const start = startedAt ?? new Date();
  const hours = qty / rate;
  return new Date(start.getTime() + hours * 3600 * 1000);
}

export const STATUSES = [
  "WAITING_APPROVAL",
  "PENDING",
  "IN_PROGRESS",
  "PAUSED",
  "QC",
  "DONE",
  "SHIPPED",
  "CANCELLED",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  WAITING_APPROVAL: "รออนุมัติ",
  PENDING: "รอผลิต",
  IN_PROGRESS: "กำลังผลิต",
  PAUSED: "หยุดชั่วคราว",
  QC: "ตรวจสอบ QC",
  DONE: "เสร็จสิ้น",
  SHIPPED: "จัดส่งแล้ว",
  CANCELLED: "ยกเลิก",
};

export const DELIVERY_OPTIONS = [
  "ด่วน",
  "ภายในวันนี้",
  "1 วันทำการ",
  "2 วันทำการ",
  "3-5 วันทำการ",
  "5-7 วันทำการ",
  "7 วันทำการ",
  "7-14 วันทำการ",
  "14 วันทำการ",
  "30 วันทำการ",
  "พิเศษ (สั่งทำ)",
];

export const STATUS_COLOR: Record<Status, string> = {
  WAITING_APPROVAL: "bg-amber-200 text-amber-900",
  PENDING: "bg-gray-200 text-gray-800",
  IN_PROGRESS: "bg-blue-200 text-blue-900",
  PAUSED: "bg-yellow-200 text-yellow-900",
  QC: "bg-purple-200 text-purple-900",
  DONE: "bg-green-200 text-green-900",
  SHIPPED: "bg-teal-200 text-teal-900",
  CANCELLED: "bg-red-200 text-red-900",
};
