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
