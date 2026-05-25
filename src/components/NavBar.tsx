"use client";
import Link from "next/link";
import { useState } from "react";
import { useSession, signOut } from "next-auth/react";

export default function NavBar() {
  const { data } = useSession();
  const role = (data?.user as any)?.role;
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-white border-b sticky top-0 z-20">
      <div className="px-3 sm:px-4 py-2 flex items-center justify-between">
        <Link href="/" className="font-bold text-base sm:text-lg">
          Production Tracker
        </Link>

        {/* desktop */}
        <nav className="hidden md:flex items-center gap-4">
          <Link href="/" className="text-sm text-gray-700 hover:text-black">Dashboard</Link>
          <Link href="/history" className="text-sm text-gray-700 hover:text-black">ประวัติการผลิต</Link>
          <Link href="/materials" className="text-sm text-gray-700 hover:text-black">สต๊อกวัสดุ</Link>
          <Link href="/products" className="text-sm text-gray-700 hover:text-black">รุ่นกระบอก</Link>
          {(role === "PRODUCTION" || role === "OWNER" || role === "SUPPORT") && (
            <Link href="/jobs/new" className="text-sm text-blue-600 hover:underline">+ งานใหม่</Link>
          )}
          {role === "OWNER" && (
            <Link href="/admin/users" className="text-sm text-purple-700 hover:underline">
              จัดการผู้ใช้
            </Link>
          )}
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
          <Link href="/" onClick={() => setOpen(false)} className="py-1.5">Dashboard</Link>
          <Link href="/history" onClick={() => setOpen(false)} className="py-1.5">ประวัติการผลิต</Link>
          <Link href="/materials" onClick={() => setOpen(false)} className="py-1.5">สต๊อกวัสดุ</Link>
          <Link href="/products" onClick={() => setOpen(false)} className="py-1.5">รุ่นกระบอก</Link>
          {(role === "PRODUCTION" || role === "OWNER" || role === "SUPPORT") && (
            <Link href="/jobs/new" onClick={() => setOpen(false)} className="py-1.5 text-blue-600">
              + งานใหม่
            </Link>
          )}
          {role === "OWNER" && (
            <Link href="/admin/users" onClick={() => setOpen(false)} className="py-1.5 text-purple-700">
              จัดการผู้ใช้
            </Link>
          )}
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
