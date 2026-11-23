import { describe, expect, it } from "vitest";
import { EXTRA_ENTRIES, NAV_ICONS, PAGE_IDS, PAGES } from "../web/nav.js";

describe("sidebar entries", () => {
  it("every page and every extra entry has an icon, and no icon is left over", () => {
    const wanted = [...PAGE_IDS, ...EXTRA_ENTRIES].sort();
    expect(Object.keys(NAV_ICONS).sort()).toEqual(wanted);
  });
  it("each icon is a list of path strings of plain drawing commands (no script, no markup)", () => {
    for (const [name, parts] of Object.entries(NAV_ICONS)) {
      expect(parts.length, name).toBeGreaterThan(0);
      for (const d of parts) expect(d, `${name}: ${d}`).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$/);
    }
  });
  it("keeps the order of the pages, with Settings last", () => {
    expect(PAGES.map(([id]) => id)).toEqual(["jobs", "daily", "calendar", "claude", "factory", "analytics", "series", "reels", "character", "settings"]);
  });
});
