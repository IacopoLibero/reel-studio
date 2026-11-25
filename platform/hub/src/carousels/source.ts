import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CarouselStyle } from "./scanner.js";

/**
 * What must stay in a carousel's folder so one slide can be drawn again later:
 * 2D, the Remotion code; 3D, the Blender scene, the wide render the slides were cut from, and the Remotion code of the slides.
 */
export const sourceOf = (style: CarouselStyle): string[] => (style === "3d" ? ["scene.py", "panorama.png", "code"] : ["code"]);

/** The source files a carousel lacks. */
export const missingSource = (dir: string, style: CarouselStyle): string[] => sourceOf(style).filter((f) => !existsSync(join(dir, f)));
