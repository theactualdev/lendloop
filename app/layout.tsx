import type { Metadata } from "next";
import { Besley, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, siteUrl } from "@/lib/site";
import ConvexClientProvider from "./ConvexClientProvider";
import "./globals.css";

// Headings. Variable font, so the 500/700/800 weights in the design all come from one file.
const besley = Besley({
  variable: "--font-besley",
  subsets: ["latin"],
});

// Body copy. Variable font.
const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
});

// Codes, dates and catalog labels. Static font: load only the two weights the design uses.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;

// Defaults for every page. Public pages add their own canonical and full Open
// Graph object through pageMetadata (lib/site.ts); member pages set a title.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
  // Google Search Console's HTML-tag check. Set GOOGLE_SITE_VERIFICATION to the
  // tag's content value on the deployment; without it, no tag.
  ...(googleVerification && { verification: { google: googleVerification } }),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${besley.variable} ${publicSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Clerk's modals and UserButton pick up the palette and type from globals.css. */}
        <ClerkProvider
          // No usage telemetry to Clerk (the privacy page says so). The server side is
          // switched off by NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED, inlined in next.config.ts.
          telemetry={false}
          appearance={{
            variables: {
              colorPrimary: "var(--ll-violet)",
              colorForeground: "var(--ll-ink)",
              colorMutedForeground: "var(--ll-ink-muted)",
              colorDanger: "var(--ll-alert)",
              colorBorder: "var(--ll-border)",
              colorRing: "var(--ll-ink)",
              fontFamily: "var(--font-public-sans)",
              borderRadius: "var(--radius)",
            },
          }}
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
        {/* The one toast region. Errors reach it through toastError (lib/errors.ts). */}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
