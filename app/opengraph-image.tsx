import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import { LogoMark } from "@/components/logo-mark";
import { LOGO_COLORS } from "@/lib/logo";
import { loadGoogleFont } from "@/lib/og-fonts";

export const alt = "LendLoop, a neighborhood tool library";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WORD = "LendLoop";
const CAPTION = "NEIGHBORHOOD TOOL LIBRARY";
const TAGLINE = "Borrow what you need. Lend what you don't.";

/**
 * Fetched once at build and kept. Without the cache, cacheComponents treats the
 * fetches as request-time work, and every preview would call Google Fonts.
 */
async function loadFonts() {
  "use cache";
  cacheLife("max");
  const [besley, plexMono, publicSans] = await Promise.all([
    loadGoogleFont("Besley", 800, WORD),
    loadGoogleFont("IBM Plex Mono", 600, CAPTION),
    loadGoogleFont("Public Sans", 400, TAGLINE),
  ]);
  return [
    besley && { name: "Besley", data: besley, weight: 800 as const },
    plexMono && { name: "IBM Plex Mono", data: plexMono, weight: 600 as const },
    publicSans && { name: "Public Sans", data: publicSans, weight: 400 as const },
  ].filter((font) => font !== null);
}

/**
 * The link preview: mark, wordmark, caption and tagline on the board's ground.
 * Prerendered at build time. A font that can't be fetched is left out, and an
 * empty list falls back to next/og's default font, so the build never fails here.
 */
export default async function OpengraphImage() {
  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          gap: 64,
          padding: "0 96px",
          background: LOGO_COLORS.ground,
          color: LOGO_COLORS.ink,
        }}
      >
        <LogoMark size={220} color={LOGO_COLORS.violet} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontFamily: "Besley",
              fontWeight: 800,
              fontSize: 112,
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {WORD}
          </div>
          <div
            style={{
              marginTop: 20,
              fontFamily: "IBM Plex Mono",
              fontWeight: 600,
              fontSize: 24,
              letterSpacing: "0.12em",
              color: LOGO_COLORS.inkMuted,
            }}
          >
            {CAPTION}
          </div>
          <div style={{ marginTop: 36, fontFamily: "Public Sans", fontSize: 32 }}>{TAGLINE}</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
