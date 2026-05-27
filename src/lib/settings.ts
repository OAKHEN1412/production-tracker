import { prisma } from "./prisma";

// Global app settings live in a single Setting row (id = "global").
export const SETTING_ID = "global";

// Master cutting allowance (mm) added to every length-cut material on every job.
export async function getCutAllowanceMm(): Promise<number> {
  const s = await prisma.setting.findUnique({ where: { id: SETTING_ID } });
  return s?.cutAllowanceMm ?? 0;
}
