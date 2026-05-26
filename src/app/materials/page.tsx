import { redirect } from "next/navigation";

// Stock + receiving now live together under /warehouse (tabbed). Keep this path
// working for old links by redirecting to the stock tab.
export default function MaterialsPage() {
  redirect("/warehouse");
}
