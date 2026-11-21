import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, headline, SAFE, CONTENT_W } from "../kit/theme";

/** `accent` colours the line in the brand's accent; `red` is the older name for it. */
export type CoverLine = { text: string; accent?: boolean; red?: boolean };
/** `logo: false` leaves out the logo frame (a brand with no logo file yet). It defaults to true. */
export type CoverProps = { lines: CoverLine[]; kicker?: string; logo?: boolean };

const LOGO_W = 640;

/**
 * Still cover for a reel (1080 x 1920). The reel's opening question in big headline type, the brand logo under it.
 * Colours and the headline font come from the brand (brand/<slug>/brand.json, see src/kit/theme.ts).
 * Everything sits in y 340 to 1440 and inside the side margins, so it survives Instagram's grid crop
 * (centre 3:4 / 4:5) and the areas Instagram covers. Without a logo (`logo: false`) the frame is left out. The logo is public/logo.png (the reel build copies the brand's logo there).
 */
export const Cover: React.FC<CoverProps> = ({ lines, kicker, logo = true }) => {
  const longest = Math.max(...lines.map((l) => l.text.length));
  const size = Math.min(175, Math.floor(CONTENT_W / (longest * 0.5)));
  // With a logo the question sits above it; without one it sits in the middle of the safe band (y 340 to 1440).
  const questionTop = logo ? 490 : Math.round(890 - (lines.length * size * 1.04) / 2);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {kicker ? (
        <div style={{ position: "absolute", left: SAFE.left, top: 350, height: 84, padding: "0 40px", borderRadius: 42, background: C.accent, color: C.paper, fontFamily: headline, fontSize: 44, letterSpacing: 4, display: "flex", alignItems: "center", textTransform: "uppercase" }}>
          {kicker}
        </div>
      ) : null}
      <div style={{ position: "absolute", left: SAFE.left, top: questionTop, width: CONTENT_W, fontFamily: headline }}>
        {lines.map((l) => (
          <div key={l.text} style={{ fontSize: size, lineHeight: 1.04, textTransform: "uppercase", color: l.accent || l.red ? C.accent : C.ink, whiteSpace: "nowrap" }}>
            {l.text}
          </div>
        ))}
      </div>
      {logo ? (
        <div style={{ position: "absolute", left: SAFE.left + (CONTENT_W - LOGO_W) / 2, top: 1090, width: LOGO_W, height: 332, borderRadius: 32, overflow: "hidden", border: `8px solid ${C.ink}`, boxSizing: "border-box" }}>
          <Img src={staticFile("logo.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
