import { ImageResponse } from "next/og";
import { LogoMark } from "@/components/logo-mark";
import { LOGO_COLORS } from "@/lib/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The home-screen icon: the full mark on the header's paper. iOS rounds the corners. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: LOGO_COLORS.paper,
        }}
      >
        <LogoMark size={128} color={LOGO_COLORS.violet} />
      </div>
    ),
    size,
  );
}
