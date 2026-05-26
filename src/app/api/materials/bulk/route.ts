import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, canEditMaterials } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Bulk-create materials from an uploaded sheet. Rows that duplicate an existing
// (or earlier-in-batch) code/name are skipped and reported, so a re-upload only
// adds the new items. Stock (qty) is taken as the opening balance.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditMaterials((session.user as any).role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!Array.isArray(body?.rows)) {
    return NextResponse.json({ error: "rows[] required" }, { status: 400 });
  }

  // Preload existing keys so we detect duplicates without a query per row.
  const existing = await prisma.material.findMany({ select: { code: true, name: true } });
  const codes = new Set(existing.map((m) => m.code).filter((c): c is string => !!c));
  const names = new Set(existing.map((m) => m.name));

  const num = (v: any) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const created: { id: string; name: string }[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < body.rows.length; i++) {
    const raw = body.rows[i] ?? {};
    const name = String(raw.name ?? "").trim();
    if (!name) {
      errors.push({ row: i + 1, error: "ไม่มีชื่อวัสดุ" });
      continue;
    }
    const code = String(raw.code ?? "").trim() || null;
    if (code && codes.has(code)) {
      errors.push({ row: i + 1, error: `รหัส "${code}" ซ้ำ` });
      continue;
    }
    if (names.has(name)) {
      errors.push({ row: i + 1, error: `ชื่อ "${name}" ซ้ำ` });
      continue;
    }
    try {
      const mat = await prisma.material.create({
        data: {
          code,
          name,
          category: String(raw.category ?? "").trim() || "อื่นๆ",
          unit: String(raw.unit ?? "").trim() || "ชิ้น",
          qty: num(raw.qty),
          minQty: num(raw.minQty),
          location: String(raw.location ?? "").trim() || null,
          notes: String(raw.notes ?? "").trim() || null,
        },
        select: { id: true, name: true },
      });
      created.push(mat);
      if (code) codes.add(code);
      names.add(name);
    } catch (e: any) {
      errors.push({ row: i + 1, error: e?.message ?? "unknown" });
    }
  }

  return NextResponse.json({
    createdCount: created.length,
    errorCount: errors.length,
    errors,
  });
}
