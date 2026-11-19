import type { Metadata } from "next";
import { Incoming } from "./incoming";

// Client-gated behind the member layout (Clerk + Convex): the validator cannot render it on the server.
export const instant = false;

export const metadata: Metadata = {
  title: "Incoming",
};

/* Screen D4. Everything here is per-member data, read in the browser behind the member layout's gate. */
export default function IncomingPage() {
  return <Incoming />;
}
