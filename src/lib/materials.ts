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

// Units whose stock is tracked piece-by-piece WITH a length (mm). Adding stock
// for these requires specifying the length of each เส้น.
export const LENGTH_UNITS = ["เส้น", "เมตร"];
export function isLengthTracked(unit?: string): boolean {
  return !!unit && LENGTH_UNITS.includes(unit);
}

export type MaterialLengthRow = { lengthMm: number; qty: number };

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
  lengths?: MaterialLengthRow[];
};

// "6000×5, 5800×3 mm" — pieces grouped by length, longest first.
export function formatLengthBreakdown(lengths?: MaterialLengthRow[]): string {
  if (!lengths || lengths.length === 0) return "";
  return [...lengths]
    .sort((a, b) => b.lengthMm - a.lengthMm)
    .map((l) => `${l.lengthMm === 0 ? "ไม่ระบุ" : l.lengthMm}×${l.qty}`)
    .join(", ");
}

// Total length on hand in mm = Σ lengthMm × qty.
export function totalLengthMm(lengths?: MaterialLengthRow[]): number {
  if (!lengths) return 0;
  return lengths.reduce((s, l) => s + l.lengthMm * l.qty, 0);
}

// Low when at or below threshold (only meaningful if a threshold is set).
export function isLowStock(m: { qty: number; minQty: number }): boolean {
  return m.minQty > 0 && m.qty <= m.minQty;
}
