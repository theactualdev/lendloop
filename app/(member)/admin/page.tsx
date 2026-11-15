import type { Metadata } from "next";
import { AdminConsole } from "@/components/admin/admin-console";

export const metadata: Metadata = {
  title: "Admin · LendLoop",
};

/* Screen D5. Per-admin data, read in the browser behind the member layout's gate; Convex enforces the role. */
export default function AdminPage() {
  return <AdminConsole />;
}
