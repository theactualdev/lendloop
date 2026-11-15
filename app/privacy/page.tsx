import Link from "next/link";
import type { Metadata } from "next";
import { IndexCard, IndexCardHeader, IndexCardTitle } from "@/components/index-card";
import { Wordmark } from "@/components/wordmark";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Privacy · LendLoop",
  description: "What the LendLoop demo stores about you, and how to have it removed.",
};

const GUTTER = "px-[clamp(16px,4vw,48px)]";

/*
 * Public (proxy.ts only protects the member routes). Static: no request data.
 * Keep it in step with README "Data minimization" and convex/retention.ts.
 */
export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip pb-18">
      <header className={cn("flex items-center justify-between gap-4 border-b bg-header py-3", GUTTER)}>
        <Wordmark />
        <Link href="/" className="text-sm font-medium text-ink-soft underline underline-offset-4">
          Back to home
        </Link>
      </header>

      <main id="main" className={cn("mx-auto w-full max-w-[760px] pt-[clamp(32px,6vw,72px)]", GUTTER)}>
        <h1 className="text-[clamp(36px,5vw,56px)] leading-[1.02] font-extrabold tracking-[-0.025em] text-balance">
          Privacy
        </h1>
        <p className="mt-4 max-w-[56ch] text-[17px] leading-[1.55] text-pretty text-ink-soft">
          LendLoop is a demo project that a friend built to try with friends. It is not a company
          and it is not a commercial service. Here is what it keeps, in plain words.
        </p>

        <IndexCard className="mt-8" aria-labelledby="stored-title">
          <IndexCardHeader>
            <IndexCardTitle id="stored-title">What it stores</IndexCardTitle>
          </IndexCardHeader>
          <ul className="list-disc space-y-2 px-6 py-5 pl-10 text-[16px] leading-[1.55] text-ink-soft">
            <li>Your first and last name and your email address, taken from your sign-in.</li>
            <li>The tools you list, and the loans you request, approve, decline or cancel.</li>
            <li>A log of the emails sent about those loans.</li>
          </ul>
        </IndexCard>

        <IndexCard className="mt-6" aria-labelledby="email-title">
          <IndexCardHeader>
            <IndexCardTitle id="email-title">Email</IndexCardTitle>
          </IndexCardHeader>
          <div className="space-y-3 px-6 py-5 text-[16px] leading-[1.55] text-ink-soft">
            <p>
              Your email address is used only to tell you about requests, approvals and return
              reminders. Nothing else is sent.
            </p>
            <p>
              Once an email has gone out, its details (your address and first name) are cleared
              after 7 days. The rest of the log is removed after 90 days, and the activity records
              after 180 days.
            </p>
          </div>
        </IndexCard>

        <IndexCard className="mt-6" aria-labelledby="neighbors-title">
          <IndexCardHeader>
            <IndexCardTitle id="neighbors-title">What neighbors see</IndexCardTitle>
          </IndexCardHeader>
          <p className="px-6 py-5 text-[16px] leading-[1.55] text-ink-soft">
            Other members see your first name next to your listings and requests. They never see
            your email address or your last name. There is no tracking and no analytics.
          </p>
        </IndexCard>

        <IndexCard className="mt-6" aria-labelledby="delete-title">
          <IndexCardHeader>
            <IndexCardTitle id="delete-title">Getting your data deleted</IndexCardTitle>
          </IndexCardHeader>
          <p className="px-6 py-5 text-[16px] leading-[1.55] text-ink-soft">
            Ask the person who invited you. They are the admin and can remove your account and
            your listings.
          </p>
        </IndexCard>

        <IndexCard className="mt-6" aria-labelledby="providers-title">
          <IndexCardHeader>
            <IndexCardTitle id="providers-title">Who handles it</IndexCardTitle>
          </IndexCardHeader>
          <div className="space-y-3 px-6 py-5 text-[16px] leading-[1.55] text-ink-soft">
            <p>Four services process your data on LendLoop&apos;s behalf.</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Clerk signs you in.</li>
              <li>Convex stores the app&apos;s data.</li>
              <li>An email provider delivers the messages.</li>
              <li>n8n sends the notifications and return reminders.</li>
            </ul>
          </div>
        </IndexCard>
      </main>
    </div>
  );
}
