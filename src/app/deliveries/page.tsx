import { redirect } from "next/navigation";

// Receiving now lives under /warehouse (tabbed). Keep this path working for old
// links by redirecting to the receiving tab.
export default function DeliveriesPage() {
  redirect("/warehouse?tab=receive");
}
