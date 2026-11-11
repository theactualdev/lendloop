import type { Metadata } from "next";
import { Besley, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
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

export const metadata: Metadata = {
  title: "LendLoop",
  description: "Borrow what you need. Lend what you don't.",
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
