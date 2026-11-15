import type { Metadata } from "next";
import { Listings } from "./listings";

// Client-gated behind the member layout (Clerk + Convex): the validator cannot render it on the server.
export const instant = false;

export const metadata: Metadata = {
  title: "My listings · LendLoop",
};

/* Screen D2. Everything here is per-member data, read in the browser behind the member layout's gate. */
export default function ListingsPage() {
  return <Listings />;
}
