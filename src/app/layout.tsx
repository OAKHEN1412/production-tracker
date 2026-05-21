import "./globals.css";
import type { Metadata } from "next";
import Providers from "@/components/Providers";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Production Tracker",
  description: "ติดตามการผลิต / ETA / สถานะงาน",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <Providers>
          <NavBar />
          <main className="p-3 sm:p-4 max-w-7xl mx-auto">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
