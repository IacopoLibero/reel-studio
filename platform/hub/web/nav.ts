/** The pages of a brand, in the order of the sidebar: [address, label]. */
export const PAGES = [
  ["jobs", "Jobs"], ["daily", "Daily"], ["calendar", "Calendar"], ["claude", "Terminal"], ["factory", "Factory"], ["analytics", "Analytics"], ["series", "Series"], ["reels", "Reels"], ["character", "Character"], ["settings", "Settings"],
] as const;
export const PAGE_IDS: readonly string[] = PAGES.map(([id]) => id);

/** The entries after the pages that are not brand pages. */
export const EXTRA_ENTRIES = ["setup", "signout"] as const;

/**
 * One icon per sidebar entry, as the parts of a 24 x 24 drawing made of strokes (the same style for all: round line ends, no fill).
 * Each string is the `d` of a path. They are plain data so the page can draw them without an icon library, and a test can check that none is missing.
 */
export const NAV_ICONS: Readonly<Record<string, readonly string[]>> = {
  jobs: ["M8 6h13", "M8 12h13", "M8 18h13", "M3 6h.01", "M3 12h.01", "M3 18h.01"],
  daily: ["M12 3v2", "M12 19v2", "M3 12h2", "M19 12h2", "M5.6 5.6l1.4 1.4", "M17 17l1.4 1.4", "M5.6 18.4L7 17", "M17 7l1.4-1.4", "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"],
  calendar: ["M7 3v4", "M17 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"],
  claude: ["M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-0-1V6a1 1 0 0 1 0-1z", "M8 10h.01", "M12 10h.01", "M16 10h.01"],
  factory: ["M3 21V10l6 4V10l6 4V6h4a1 1 0 0 1 1 1v14H3z", "M8 17h.01", "M13 17h.01", "M18 17h.01"],
  analytics: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  series: ["M4 7h16", "M6 3h12", "M4 11h16v9H4z"],
  reels: ["M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M10 9l5 3-5 3z"],
  character: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
  settings: ["M4 6h10", "M18 6h2", "M4 12h2", "M10 12h10", "M4 18h12", "M20 18h0", "M16 4v4", "M8 10v4", "M18 16v4"],
  setup: ["M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"],
  signout: ["M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4", "M16 17l5-5-5-5", "M21 12H9"],
};
