import { MemberHeader } from "@/components/member-header";
import { NameNudge } from "@/components/name-nudge";
import { ProvisioningGate } from "@/components/provisioning-gate";

/*
 * The signed-in shell. proxy.ts already sends signed-out visitors to Clerk, so
 * everything here is for members. The header renders straight away; the page
 * waits behind ProvisioningGate until ensureUser has run for this identity, so
 * member queries never hit "user not provisioned".
 */
export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col overflow-x-clip pb-22">
      <MemberHeader />
      <NameNudge />
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <ProvisioningGate>{children}</ProvisioningGate>
      </main>
    </div>
  );
}
