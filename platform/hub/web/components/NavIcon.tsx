import { NAV_ICONS } from "../nav";

/** The icon of a sidebar entry. Decorative: the label next to it says what it is. */
export function NavIcon({ name }: { name: string }) {
  const parts = NAV_ICONS[name] ?? [];
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {parts.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
