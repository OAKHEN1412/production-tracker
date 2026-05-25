// Material categories tailored to pneumatic (air) cylinder production.
export const MATERIAL_CATEGORIES = [
  "ท่อ/กระบอกสูบ",
  "ลูกสูบ",
  "แกน/ก้านสูบ",
  "ฝาหน้า-หลัง",
  "ซีล/โอริง",
  "แม่เหล็ก/เซนเซอร์",
  "อุปกรณ์ลม/ข้อต่อ",
  "น็อต/สกรู",
  "อื่นๆ",
] as const;

export const MATERIAL_UNITS = ["ชิ้น", "เส้น", "เมตร", "กก.", "ชุด", "ตัว"] as const;

export type Material = {
  id: string;
  code: string | null;
  name: string;
  category: string;
  unit: string;
  qty: number;
  minQty: number;
  location: string | null;
  notes: string | null;
};

// Low when at or below threshold (only meaningful if a threshold is set).
export function isLowStock(m: { qty: number; minQty: number }): boolean {
  return m.minQty > 0 && m.qty <= m.minQty;
}
