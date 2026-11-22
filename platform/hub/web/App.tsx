import { useEffect, useState } from "react";
import type { BrandSummary } from "../src/shared/types";
import { api, setBrand, type BrandList } from "./api";
import { NEW_BRAND, rememberBrand, rememberedBrand, routeHash, useJobs, useRoute } from "./hooks";
import { Login } from "./pages/Login";
import { JobsPage } from "./pages/Jobs";
import { ClaudePage } from "./pages/Claude";
import { CalendarPage } from "./pages/Calendar";
import { FactoryPage } from "./pages/Factory";
import { DailyPage } from "./pages/Daily";
import { ReelsPage } from "./pages/Reels";
import { ReelPage } from "./pages/ReelPage";
import { CharacterPage } from "./pages/Character";
import { AnalyticsPage } from "./pages/Analytics";
import { SeriesPage } from "./pages/Series";
import { SettingsPage } from "./pages/Settings";
import { NewBrandPage } from "./pages/NewBrand";
import { SetupPage } from "./pages/Setup";
import { NextSteps, markWelcome } from "./components/NextSteps";
import { BRANDS_CHANGED } from "./hooks";
import type { Created } from "./creator/useCreate";

const PAGES = [
  ["jobs", "Jobs"], ["daily", "Daily"], ["calendar", "Calendar"], ["claude", "Claude"], ["factory", "Factory"], ["analytics", "Analytics"], ["series", "Series"], ["reels", "Reels"], ["character", "Character"], ["settings", "Settings"],
] as const;
const PAGE_IDS: readonly string[] = PAGES.map(([id]) => id);

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => { api.me().then(() => setAuthed(true)).catch(() => setAuthed(false)); }, []);
  if (authed === null) return null;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return <Shell onLogout={() => api.logout().finally(() => setAuthed(false))} />;
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const [list, setList] = useState<BrandList | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.brands().then(setList).catch((e: Error) => setError(e.message)); }, []);
  // A page that changed what the brand list shows (colours, logo) says so, and the list is read again.
  useEffect(() => {
    const reload = () => { api.brands().then(setList).catch(() => undefined); };
    window.addEventListener(BRANDS_CHANGED, reload);
    return () => window.removeEventListener(BRANDS_CHANGED, reload);
  }, []);
  const [setup, setSetup] = useState<"loading" | "needed" | "done">("loading");
  useEffect(() => { api.setup().then((d) => setSetup(d.state.completed ? "done" : "needed")).catch(() => setSetup("done")); }, []);
  const route = useRoute(PAGE_IDS);
  const fallbackPage = window.location.pathname === "/daily" ? "daily" : "calendar";

  if (error) return <p className="error" style={{ padding: 24 }}>{error}</p>;
  if (!list || setup === "loading") return null;
  // First run (setup not finished and no brand yet) and the "#/setup" link: the setup screen instead of the hub.
  if ((setup === "needed" && list.brands.length === 0) || window.location.hash === "#/setup") {
    const leave = () => { setSetup("done"); window.location.hash = ""; };
    return <main style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}><SetupPage onFinished={leave} onSkip={leave} /></main>;
  }
  const known = (slug: string | null): BrandSummary | undefined => list.brands.find((b) => b.slug === slug);
  const remembered = known(rememberedBrand()) ? rememberedBrand() : null;
  const wanted = route.brand && route.brand !== NEW_BRAND ? route.brand : (remembered ?? list.default);
  const current = known(route.brand) ?? (route.brand === NEW_BRAND ? known(remembered) ?? known(list.default) : known(wanted));

  // `#/<page>` (an old link) and an empty hash go to `#/<brand>/<page>` of the remembered or default brand.
  if (route.brand !== NEW_BRAND && current && (route.brand !== current.slug || !route.page)) {
    window.location.replace(routeHash(current.slug, route.page ?? fallbackPage, route.item ?? undefined));
    return null;
  }
  if (current) { setBrand(current.slug); rememberBrand(current.slug); }
  // A brand was just created: reload the list (the switcher shows it), remember the checklist, and land on its hub.
  const created = (c: Created) => {
    markWelcome({ slug: c.slug, character: c.character });
    rememberBrand(c.slug);
    api.brands().then((l) => { setList(l); window.location.hash = routeHash(c.slug, "calendar"); }).catch((e: Error) => setError(e.message));
  };
  return (
    <div className="shell">
      <nav>
        <div className="brand">Reel <span>Hub</span></div>
        <BrandSwitcher brands={list.brands} current={route.brand === NEW_BRAND ? NEW_BRAND : current?.slug ?? ""} page={route.page ?? "calendar"} />
        {current && PAGES.map(([id, label]) => (
          <NavLink key={id} brand={current.slug} id={id} label={label} on={route.page === id} />
        ))}
        <div className="spacer" />
        <a href="#/setup">Setup</a>
        <a href="#/jobs" onClick={(e) => { e.preventDefault(); onLogout(); }}>Sign out</a>
      </nav>
      <main>
        {route.brand === NEW_BRAND && <NewBrandPage onCreated={created} />}
        {route.brand !== NEW_BRAND && !current && <NoBrand brands={list.brands} asked={route.brand} />}
        {route.brand !== NEW_BRAND && current && <BrandPages key={current.slug} brand={current} page={route.page ?? fallbackPage} item={route.item} />}
      </main>
    </div>
  );
}

function NavLink({ brand, id, label, on }: { brand: string; id: string; label: string; on: boolean }) {
  return <a href={routeHash(brand, id)} className={on ? "on" : ""}>{label}<JobCount page={id} /></a>;
}

/** The count of running jobs next to "Jobs" comes from the page below, so the nav stays a plain list. */
function JobCount({ page }: { page: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (page !== "jobs") return;
    const on = (e: Event) => setN((e as CustomEvent<number>).detail);
    window.addEventListener("reelhub:running", on);
    return () => window.removeEventListener("reelhub:running", on);
  }, [page]);
  return page === "jobs" && n ? <>{` (${n})`}</> : null;
}

function BrandSwitcher({ brands, current, page }: { brands: BrandSummary[]; current: string; page: string }) {
  const cur = brands.find((b) => b.slug === current);
  return (
    <div className="brand-switch">
      <span className="dot" style={{ background: cur?.accent ?? "var(--muted)" }} aria-hidden="true" />
      <select aria-label="Brand" value={current} onChange={(e) => { window.location.hash = e.target.value === NEW_BRAND ? `#/${NEW_BRAND}` : routeHash(e.target.value, page); }}>
        {brands.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
        <option value={NEW_BRAND}>+ New brand</option>
      </select>
    </div>
  );
}

function NoBrand({ brands, asked }: { brands: BrandSummary[]; asked: string | null }) {
  return (
    <>
      <h1>{brands.length ? "Brand not found" : "No brand yet"}</h1>
      <p className="sub">{brands.length ? `There is no brand called "${asked ?? ""}". Pick one in the list on the left.` : "Create your first brand to start."}</p>
      <p><a className="btn primary" href={`#/${NEW_BRAND}`}>New brand</a></p>
    </>
  );
}

function BrandPages({ brand, page, item }: { brand: BrandSummary; page: string; item: string | null }) {
  const jobs = useJobs(brand.slug);
  const running = jobs.filter((j) => j.status === "running" || j.status === "queued").length;
  useEffect(() => { window.dispatchEvent(new CustomEvent("reelhub:running", { detail: running })); }, [running]);
  return (
    <>
      <NextSteps brand={brand} />
      {page === "jobs" && <JobsPage jobs={jobs} />}
      {page === "claude" && <ClaudePage />}
      {page === "daily" && <DailyPage jobs={jobs} />}
      {page === "calendar" && <CalendarPage jobs={jobs} />}
      {page === "factory" && <FactoryPage jobs={jobs} />}
      {page === "analytics" && <AnalyticsPage jobs={jobs} />}
      {page === "series" && <SeriesPage jobs={jobs} />}
      {page === "reels" && !item && <ReelsPage jobs={jobs} />}
      {page === "reels" && item && <ReelPage key={item} folder={item} jobs={jobs} />}
      {page === "character" && <CharacterPage jobs={jobs} brand={brand} />}
      {page === "settings" && <SettingsPage key={brand.slug} brand={brand} />}
    </>
  );
}
