import type { Metadata } from "next";
import { Listings } from "./listings";

export const metadata: Metadata = {
  title: "My listings · LendLoop",
};

/* Screen D2. Everything here is per-member data, read in the browser behind the member layout's gate. */
export default function ListingsPage() {
  return <Listings />;
}
