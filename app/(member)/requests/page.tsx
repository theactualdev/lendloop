import type { Metadata } from "next";
import { Requests } from "./requests";

export const metadata: Metadata = {
  title: "My requests · LendLoop",
};

/* Screen D3. Everything here is per-member data, read in the browser behind the member layout's gate. */
export default function RequestsPage() {
  return <Requests />;
}
