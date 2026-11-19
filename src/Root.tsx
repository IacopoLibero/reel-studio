import React from "react";
import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { Cover } from "./cover/Cover";
import { FPS, H, W } from "./kit/theme";

/**
 * Only generic compositions are registered here, so the public project builds with no brand in it.
 * Each reel is rendered from its own entry: `npx remotion render src/r<n>/index.ts <id> out.mp4`
 * (the reel's own folder lives with your brand, outside git; see the README, "Your brands").
 */
export const RemotionRoot: React.FC = () => (
  <>
    <MyComposition />
    <Composition id="Cover" component={Cover} width={W} height={H} fps={FPS} durationInFrames={1} defaultProps={{ lines: [{ text: "Your question" }, { text: "goes here?", accent: true }] }} />
  </>
);
