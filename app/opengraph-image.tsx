import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
import { LogoMark } from "@/components/logo-mark";
import { LOGO_COLORS } from "@/lib/logo";
import { loadGoogleFonts } from "@/lib/og-fonts";
import { OG_IMAGE } from "@/lib/site";

export const alt = OG_IMAGE.alt;
export const size = { width: OG_IMAGE.width, height: OG_IMAGE.height };
export const contentType = OG_IMAGE.type;

const WORD = "LendLoop";
const CAPTION = "NEIGHBORHOOD TOOL LIBRARY";
const TAGLINE = "Borrow what you need. Lend what you don't.";

/**
 * Fetched at build and kept. Without the cache, cacheComponents treats the
 * fetches as request-time work, and every preview would call Google Fonts. A
 * miss is kept for hours, not 30 days, so the next render tries again.
 */
async function loadFonts() {
  "use cache";
  const fonts = await loadGoogleFonts([
    { family: "Besley", weight: 800, text: WORD },
    { family: "IBM Plex Mono", weight: 600, text: CAPTION },
    { family: "Public Sans", weight: 400, text: TAGLINE },
  ]);
  if (fonts) cacheLife("max");
  else cacheLife("hours");
  return fonts;
}

/**
 * The link preview: mark, wordmark, caption and tagline on the board's ground.
 * Prerendered at build time. If the fonts can't be fetched, it is drawn in
 * next/og's default font, so the build never fails here.
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
    { ...size, fonts: fonts ?? undefined },
  );
}
