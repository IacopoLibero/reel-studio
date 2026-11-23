import { useEffect, useMemo, useState } from "react";
import type { BrandSummary, Settings } from "../../src/shared/types";
import { api } from "../api";
import { useLoad } from "../hooks";
import { SkillsSection } from "../components/SkillsSection";
import { SetupVoice } from "./SetupVoice";
import { VoiceLanguage } from "../components/VoiceLanguage";
import { AiAccess } from "../components/AiAccess";
import { InstagramAccess } from "../components/InstagramAccess";
import { DeleteBrand } from "../components/DeleteBrand";
import { BrandStyleSection } from "../components/BrandStyle";
import { Chips, CopyTimes, Row, Section, TimesEditor } from "../components/SettingsParts";
import { fromDraft, isDirty, postsPerWeek, toDraft, validate, type SettingsDraft } from "../settings-form";

const SECTIONS = [
  ["set-general", "General"],
  ["set-style", "Colours and closings"],
  ["set-schedule", "Posting schedule"],
  ["set-daily", "Daily loop"],
  ["set-factory", "Reel factory"],
  ["set-ai", "Claude and Codex"],
  ["set-skills", "Skills"],
  ["set-instagram", "Instagram"],
  ["set-voice", "Voice"],
  ["set-assistant", "Brand assistant"],
  ["set-danger", "Delete brand"],
] as const;

type Msg = { kind: "ok" | "err"; text: string } | null;

export function SettingsPage({ brand }: { brand: BrandSummary }) {
  const { data, error } = useLoad(api.settings);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { setSaved(data); setDraft(toDraft(data)); } }, [data]);

  const problems = useMemo(() => (draft ? validate(draft) : {}), [draft]);
  const dirty = !!(saved && draft && isDirty(saved, draft));
  const nProblems = Object.keys(problems).length;

  // Leaving with unsaved changes asks first (closing or reloading the tab).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (!draft || !saved) return <>{error ? <p className="error">{error}</p> : <p className="muted">Loading</p>}</>;
  const s = draft.settings;
  const set = (patch: Partial<Settings>) => { setMsg(null); setDraft({ ...draft, settings: { ...s, ...patch } }); };
  const change = (patch: Partial<SettingsDraft>) => { setMsg(null); setDraft({ ...draft, ...patch }); };

  const save = async () => {
    if (nProblems || busy) return;
    setBusy(true); setMsg(null);
    try {
      const next = await api.saveSettings(fromDraft(draft));
      setSaved(next); setDraft(toDraft(next)); setMsg({ kind: "ok", text: "Saved." });
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); } finally { setBusy(false); }
  };
  const discard = () => { setDraft(toDraft(saved)); setMsg(null); };
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      <h1>Settings</h1>
      <p className="sub">Posting schedule, daily loop and reel factory are saved for <strong>{brand.name}</strong>. Blender device, Claude model and skills are shared by every brand.</p>
      <div className="set-layout">
        <nav className="set-nav" aria-label="Settings sections">
          {SECTIONS.map(([id, label]) => <button type="button" key={id} onClick={() => jump(id)}>{label}</button>)}
        </nav>
        <div className="set-main">
          <Section id="set-general" title="General">
            <Row label="Instagram account" htmlFor="s-account" help="The account name of this brand. The login is in the Instagram section below.">
              <input id="s-account" type="text" value={s.accountName} onChange={(e) => set({ accountName: e.target.value })} />
            </Row>
            <Row label="Blender device" htmlFor="s-blender" help="Auto uses the GPU when it is free. CPU is slower but never competes with the voice.">
              <select id="s-blender" value={s.blenderDevice} onChange={(e) => set({ blenderDevice: e.target.value as Settings["blenderDevice"] })}>
                <option value="auto">Auto</option><option value="cpu">CPU</option><option value="gpu">GPU</option>
              </select>
            </Row>
            <Row label="Claude model" htmlFor="s-model" help="Leave empty to use your default model.">
              <input id="s-model" type="text" value={s.claudeModel} placeholder="Default" onChange={(e) => set({ claudeModel: e.target.value })} />
            </Row>
          </Section>

          <Section id="set-style" title="Colours, fonts and closings" intro="Every new reel and cover is drawn with these. This part has its own Save button; reels already made are not redrawn.">
            <BrandStyleSection brand={brand} />
          </Section>

          <Section id="set-schedule" title="Posting schedule" intro={`Free slots in the Calendar and the times offered when you schedule a reel. ${postsPerWeek(draft.days)} posts a week.`}>
            <Row label="Time zone" htmlFor="s-tz" problem={problems.timezone} help="A name such as Europe/Rome.">
              <input id="s-tz" type="text" value={s.slotPattern.timezone} onChange={(e) => set({ slotPattern: { ...s.slotPattern, timezone: e.target.value } })} />
            </Row>
            <div className="set-days">
              {draft.days.map((times, i) => (
                <TimesEditor key={i} dayIndex={i} times={times} problem={problems[`day${i}`]} onChange={(t) => change({ days: draft.days.map((d, j) => (j === i ? t : d)) })} />
              ))}
            </div>
            <CopyTimes days={draft.days} onChange={(d) => change({ days: d })} />
          </Section>

          <Section id="set-daily" title="Daily loop" intro="Once a day the hub reads your numbers, proposes ideas and sends a notification. Nothing is made or scheduled until you approve it.">
            <Row label="Run automatically" help="Off until you switch it on.">
              <button type="button" className="switch" role="switch" aria-checked={s.daily.enabled} aria-label="Run the daily loop automatically"
                onClick={() => set({ daily: { ...s.daily, enabled: !s.daily.enabled } })} />
            </Row>
            <Row label="Earliest time" htmlFor="s-earliest" problem={problems.earliest} help="It runs at the first check after this time, once the PC is online. At most once a day.">
              <input id="s-earliest" type="time" value={s.daily.earliest} onChange={(e) => set({ daily: { ...s.daily, earliest: e.target.value } })} />
            </Row>
            <Row label="Ideas per day" htmlFor="s-ideas" problem={problems.ideas} help="From 1 to 10.">
              <input id="s-ideas" type="number" min={1} max={10} value={s.daily.ideas} onChange={(e) => set({ daily: { ...s.daily, ideas: Number(e.target.value) } })} />
            </Row>
            <Row label="Threads text" help="Paused. Writing a Threads post for each idea waits until Threads is connected (see TODO.md).">
              <button type="button" className="switch" role="switch" aria-checked={s.daily.threads} aria-label="Write a Threads text for each idea"
                onClick={() => set({ daily: { ...s.daily, threads: !s.daily.threads } })} />
            </Row>
          </Section>

          <Section id="set-factory" title="Reel factory">
            <Row label="Reels made at the same time" htmlFor="s-conc" problem={problems.concurrency} help="From 1 to 6. The voice still runs one at a time.">
              <input id="s-conc" type="number" min={1} max={6} value={s.factory.concurrency} onChange={(e) => set({ factory: { ...s.factory, concurrency: Number(e.target.value) } })} />
            </Row>
            <Row label="Closing A words" help="Question is about something the product offers: ends with the brand offer and website. A trailing * matches word starts (qr* finds qr and qrcode).">
              <Chips items={draft.product} onChange={(product) => change({ product })} placeholder="Add a word and press Enter" label="Add a closing A word" />
            </Row>
            <Row label="Closing B words" help="General advice: ends with Follow for tips. The question text decides first, the source only when the question matches nothing. No match gives B.">
              <Chips items={draft.general} onChange={(general) => change({ general })} placeholder="Add a word and press Enter" label="Add a closing B word" />
            </Row>
          </Section>

          <Section id="set-ai" title="Claude and Codex" intro="How each one signs in: with its own login (your subscription) or with an API key. The sidebar shows how much of the Claude subscription is used.">
            <AiAccess />
          </Section>

          <div id="set-skills" className="set-skills"><SkillsSection /></div>

          <Section id="set-instagram" title="Instagram" intro="Reels are scheduled in Instagram's own scheduler, through a Chromium browser that this brand logs in to once. The login stays in the brand's folder.">
            <InstagramAccess account={s.accountName} />
          </Section>

          <Section id="set-voice" title="Voice" intro="The voice models VoiceStudio uses for the narration of every brand. Download one, choose the one to use, or remove the ones you do not need to free the disk.">
            <VoiceLanguage key={brand.slug + brand.language} current={brand.language} brandName={brand.name} />
            <SetupVoice />
          </Section>

          <Section id="set-assistant" title="Brand assistant" intro="Used by New brand > Discuss it with an AI, for every brand. One turn per message, with the whole conversation as input.">
            <Row label="Assistant" htmlFor="s-asst" help="Claude is the default and the one that was tried the most. Codex runs `codex exec` in a read-only sandbox with the prompt on stdin (it must be installed and signed in: `codex login`, or an API key in the Codex section above). Use the Test button of Codex above to check it.">
              <select id="s-asst" value={s.assistant.kind} onChange={(e) => set({ assistant: { kind: e.target.value as Settings["assistant"]["kind"] } })}>
                <option value="claude">Claude (default)</option><option value="codex">Codex</option>
              </select>
            </Row>
            {s.assistant.kind !== "claude" && <p className="warn-box">This assistant gets no tool limits from the hub, because the hub cannot set them. Only claude runs with read-only tools and no access to credentials.</p>}
          </Section>

          <DeleteBrand brand={brand} />
        </div>
      </div>

      <div className="savebar" role="region" aria-label="Save settings">
        <span className={dirty ? "dirty" : "muted"} aria-live="polite">
          {nProblems ? `${nProblems} ${nProblems === 1 ? "field needs" : "fields need"} fixing` : dirty ? "Unsaved changes" : msg?.kind === "ok" ? msg.text : "All changes saved"}
        </span>
        {msg?.kind === "err" && <span className="error">{msg.text}</span>}
        <span className="grow" />
        <button type="button" className="btn" disabled={!dirty || busy} onClick={discard}>Discard</button>
        <button type="button" className="btn primary" disabled={!dirty || nProblems > 0 || busy} onClick={() => void save()}>{busy ? "Saving" : "Save"}</button>
      </div>
    </>
  );
}
