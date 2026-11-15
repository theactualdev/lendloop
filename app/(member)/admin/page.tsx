import type { Metadata } from "next";
import { AdminConsole } from "@/components/admin/admin-console";

// Client-gated behind the member layout (Clerk + Convex): the validator cannot render it on the server.
export const instant = false;

export const metadata: Metadata = {
  title: "Admin · LendLoop",
};

/* Screen D5. Per-admin data, read in the browser behind the member layout's gate; Convex enforces the role. */
export default function AdminPage() {
  return <AdminConsole />;
}
