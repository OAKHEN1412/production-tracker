"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

type NavLink = { href: string; label: string; cls?: string; badge?: number };

export default function NavBar() {
  const { data } = useSession();
  const role = (data?.user as any)?.role as string | undefined;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(0);

  const canApprove = role === "OWNER" || role === "PRODUCTION";
  const canCreate = role === "OWNER" || role === "PRODUCTION" || role === "SUPPORT";
  const canWarehouse = role === "OWNER" || role === "PRODUCTION" || role === "SHIPPING";
  const canRecipe = role === "OWNER" || role === "PRODUCTION";
  const seesHistory = role !== "SHIPPING"; // everyone but warehouse-only

  // Live-ish badge of requests awaiting approval (re-checked on navigation).
  useEffect(() => {
    if (!canApprove) return;
    let alive = true;
    fetch("/api/jobs/pending-approval")
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((j) => alive && setPendingApproval(j.count ?? 0))
      .catch(() => {});
    return () => { alive = false; };
  }, [canApprove, pathname]);

  // Build the link set this role actually uses — keeps the bar uncluttered.
  const links: NavLink[] = [{ href: "/", label: "Dashboard" }];
  if (canApprove) links.push({ href: "/approvals", label: "รออนุมัติ", cls: "text-amber-700", badge: pendingApproval });
  if (seesHistory) links.push({ href: "/history", label: "ประวัติการผลิต" });
  if (canWarehouse) links.push({ href: "/warehouse", label: "คลัง" });
  if (canRecipe) links.push({ href: "/products", label: "รุ่นกระบอก" });
  if (canCreate) links.push({ href: "/jobs/new", label: "+ งานใหม่", cls: "text-blue-600" });
  if (role === "OWNER") links.push({ href: "/admin/users", label: "จัดการผู้ใช้", cls: "text-purple-700" });

  function renderLink(l: NavLink, onClick?: () => void) {
    return (
      <Link key={l.href} href={l.href} onClick={onClick}
        className={`text-sm hover:underline ${l.cls ?? "text-gray-700 hover:text-black"}`}>
        {l.label}
        {l.badge ? (
          <span className="ml-1 inline-flex items-center justify-center text-[10px] font-bold text-white bg-amber-600 rounded-full px-1.5 py-0.5">
            {l.badge}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <header className="bg-white border-b sticky top-0 z-20">
      <div className="px-3 sm:px-4 py-2 flex items-center justify-between">
        <Link href="/" className="font-bold text-base sm:text-lg">
          Production Tracker
        </Link>

        {/* desktop */}
        <nav className="hidden md:flex items-center gap-4">
          {links.map((l) => renderLink(l))}
          {data?.user ? (
            <>
              <span className="text-sm text-gray-700">
                {data.user.name} <span className="text-xs text-gray-500">({role})</span>
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-sm text-red-600 hover:underline"
              >
                ออก
              </button>
            </>
          ) : (
            <Link href="/login" className="text-sm text-blue-600 hover:underline">เข้าสู่ระบบ</Link>
          )}
        </nav>

        {/* mobile burger */}
        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 rounded hover:bg-gray-100"
          aria-label="menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path d="M6 6l12 12M6 18L18 6" />
            ) : (
              <path d="M3 6h18M3 12h18M3 18h18" />
            )}
          </svg>
        </button>
      </div>

      {/* mobile menu */}
      {open && (
        <nav className="md:hidden border-t bg-white px-3 py-2 flex flex-col gap-2 text-sm">
          {links.map((l) => (
            <div key={l.href} className="py-1.5">{renderLink(l, () => setOpen(false))}</div>
          ))}
          {data?.user && (
            <div className="border-t pt-2 mt-1 flex items-center justify-between">
              <span className="text-gray-700">
                {data.user.name} <span className="text-xs text-gray-500">({role})</span>
              </span>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-red-600"
              >
                ออก
              </button>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
