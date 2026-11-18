/*
 * Fonts for the generated images (app/opengraph-image.tsx). next/og needs the
 * raw TTF bytes, so this asks Google Fonts for a subset holding just `text`, the
 * way next/font/google already fetches the app's fonts at build time. A server
 * request without a browser user agent gets TrueType back.
 *
 * Never throws: on any failure it returns null, and the image is drawn in
 * next/og's default font rather than failing the build.
 */
export async function loadGoogleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const params = new URLSearchParams({ family: `${family}:wght@${weight}`, text });
    const css = await (await fetch(`https://fonts.googleapis.com/css2?${params}`)).text();
    const source = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!source) return null;
    const font = await fetch(source);
    return font.ok ? await font.arrayBuffer() : null;
  } catch {
    return null;
  }
}

type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export type FontRequest = { family: string; weight: FontWeight; text: string };
export type OgFont = { name: string; data: ArrayBuffer; weight: FontWeight };

/**
 * All the fonts or none. Each subset holds only its own text, so a partial set
 * would draw the missing font's text from another subset with gaps in it; with
 * none, next/og draws everything in its default font instead.
 */
export async function loadGoogleFonts(
  requests: readonly FontRequest[],
): Promise<OgFont[] | null> {
  const data = await Promise.all(
    requests.map(({ family, weight, text }) => loadGoogleFont(family, weight, text)),
  );
  if (data.some((font) => font === null)) return null;
  return requests.map(({ family, weight }, i) => ({ name: family, data: data[i]!, weight }));
}
