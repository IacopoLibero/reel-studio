import { useMemo, useState } from "react";
import type { CharacterBrand, CreatorOptions, FontList } from "../api";
import { Card, ClosingKeywords, ClosingPreview, ColorField, FontField, Text } from "./fields";
import { Extras } from "./Extras";
import { Row } from "../components/SettingsParts";
import { closingRulesOf, draftToBrand, emptyDraft as emptyDraftValue, LANGUAGES, SLUG_OK, validateDraft, withName, type BrandDraft } from "./draft";
import { emptyExtras, extrasProblems, extrasToRequest, type ExtrasState } from "./extras";
import { CreateStatus, useCreate, type Created } from "./useCreate";

/** The brand fields of the form, without the create button: the interview review and the import preview reuse them to fix a detail. */
export function BrandFields({ draft, onChange, options, fonts, problems }: { draft: BrandDraft; onChange: (d: BrandDraft) => void; options: CreatorOptions; fonts: FontList; problems: Readonly<Record<string, string>> }) {
  const set = (patch: Partial<BrandDraft>) => onChange({ ...draft, ...patch });
  const c = draft.colors;
  return (
    <>
      <Card title="The brand">
        <Text label="Name" value={draft.name} problem={problems.name} placeholder="Acme Bakery" onChange={(v) => onChange(withName(draft, v, options.slugs))} />
        <Text label="Slug" value={draft.slug} problem={problems.slug} help="The folder name and the address of this brand's hub. Made from the name; you can change it." onChange={(v) => set({ slug: v.toLowerCase(), slugTouched: true })} />
        <Row label="Language of the reels" htmlFor="f-lang" help="What the voice and the captions are written in.">
          <select id="f-lang" value={draft.language} onChange={(e) => set({ language: e.target.value })}>{LANGUAGES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        </Row>
        <Text label="Website" value={draft.website} placeholder="acmebakery.example" help="Shown large on the last card." onChange={(v) => set({ website: v })} />
        <Text label="What it sells or does" multiline value={draft.about} placeholder="Fresh bread and pastry, baked every morning." onChange={(v) => set({ about: v })} />
        <Text label="Who the reels are for" multiline value={draft.audience} placeholder="Families and people who work nearby." onChange={(v) => set({ audience: v })} />
        <Text label="Tone" value={draft.tone} placeholder="Warm, direct, a little playful" onChange={(v) => set({ tone: v })} />
      </Card>

      <Card title="Colours and fonts" intro="Every reel and cover is drawn with these.">
        <ColorField label="Background" value={c.background} problem={problems["color-background"]} onChange={(v) => set({ colors: { ...c, background: v } })} against={c.text} againstLabel="the text colour" />
        <ColorField label="Text" value={c.text} problem={problems["color-text"]} onChange={(v) => set({ colors: { ...c, text: v } })} />
        <ColorField label="Accent" help="Use it only on what matters." value={c.accent} problem={problems["color-accent"]} onChange={(v) => set({ colors: { ...c, accent: v } })} against={c.background} />
        <ColorField label="Second accent" help="Rare, for a second highlight." value={c.secondary} problem={problems["color-secondary"]} onChange={(v) => set({ colors: { ...c, secondary: v } })} against={c.background} />
        <FontField label="Headline font" value={draft.fonts.headline} names={fonts.names} checked={fonts.checked} problem={problems["font-headline"]} onChange={(v) => set({ fonts: { ...draft.fonts, headline: v } })} />
        <FontField label="Body font" value={draft.fonts.body} names={fonts.names} checked={fonts.checked} problem={problems["font-body"]} onChange={(v) => set({ fonts: { ...draft.fonts, body: v } })} />
      </Card>

      <Card title="How every reel ends" intro="Two closing lines. Each reel picks A or B. Twelve words or fewer sounds best.">
        {(["A", "B"] as const).map((k) => (
          <div key={k} className="closing-pair">
            <div>
              <Text label={`Option ${k}: label`} value={draft.closing[k].label} problem={problems[`closing-${k}-label`]} help={k === "A" ? "About what the brand offers." : "General advice, asks to follow."} onChange={(v) => set({ closing: { ...draft.closing, [k]: { ...draft.closing[k], label: v } } })} />
              <Text label={`Option ${k}: spoken line`} value={draft.closing[k].line} problem={problems[`closing-${k}-line`]} onChange={(v) => set({ closing: { ...draft.closing, [k]: { ...draft.closing[k], line: v } } })} />
            </div>
            <ClosingPreview label={draft.closing[k].label} line={draft.closing[k].line} website={draft.website} colors={c} />
          </div>
        ))}
      </Card>

      <Card title="Which closing a reel gets" intro="Each reel starts from a question. The words below pick its closing: A when the question is about what the brand offers, B when it is general advice. You can change them later in Settings.">
        <ClosingKeywords value={draft.closingKeywords} onChange={(v) => set({ closingKeywords: v })} />
      </Card>

      <Card title="Offer, Instagram and sources (all optional)">
        <Row label="Running an offer" help="After its last day the offer line is left out of captions automatically.">
          <button type="button" className="switch" role="switch" aria-checked={draft.offerOn} aria-label="Running an offer" onClick={() => set({ offerOn: !draft.offerOn })} />
        </Row>
        {draft.offerOn && <Text label="Last day" type="date" value={draft.offer.lastDay} problem={problems["offer-lastDay"]} onChange={(v) => set({ offer: { ...draft.offer, lastDay: v } })} />}
        {draft.offerOn && <Text label="Code word in captions" value={draft.offer.regex} problem={problems["offer-regex"]} help="Optional. The scheduler looks for it to remove the offer line after the last day." placeholder="BREAD10" onChange={(v) => set({ offer: { ...draft.offer, regex: v } })} />}
        <Text label="Instagram account" value={draft.instagramAccount} problem={problems.instagram} placeholder="acme_bakery" help="Without the @. You log in in Settings > Instagram after creating it." onChange={(v) => set({ instagramAccount: v.replace(/^@/, "") })} />
        <Text label="Folder of source texts" value={draft.blogDir} problem={problems.blogDir} placeholder="/home/me/blog/posts" help="Optional. Blog posts or notes the idea jobs read, as a full path on this machine." onChange={(v) => set({ blogDir: v })} />
      </Card>
    </>
  );
}

/** What the voice step needs to know about a brand typed so far. */
export const voiceBrandOf = (d: BrandDraft) => ({ name: d.name.trim(), language: d.language, about: d.about.trim(), audience: d.audience.trim(), tone: d.tone.trim() });

/** What the character conversation is told about the brand typed so far (and, in the interview, the style guide and the earlier talk). */
export const characterBrandOf = (d: BrandDraft, more: { styleMd?: string; earlier?: { role: "user" | "assistant"; text: string }[] } = {}): CharacterBrand => ({
  name: d.name.trim(), about: d.about.trim(), audience: d.audience.trim(), tone: d.tone.trim(), language: d.language, website: d.website.trim(),
  colors: d.colors, fonts: d.fonts, ...(more.styleMd ? { styleMd: more.styleMd } : {}), ...(more.earlier ? { earlier: more.earlier } : {}),
});

/** Entry 1: the form. */
export function FormEntry({ options, fonts, onCreated }: { options: CreatorOptions; fonts: FontList; onCreated: (c: Created) => void }) {
  const [draft, setDraft] = useState<BrandDraft>(() => withName({ ...emptyDraftValue() }, "", options.slugs));
  const [extras, setExtras] = useState<ExtrasState>(emptyExtras);
  const [tried, setTried] = useState(false);
  const create = useCreate(onCreated);
  const problems = useMemo(() => ({ ...validateDraft(draft, { taken: options.slugs, fontNames: fonts.names, fontsChecked: fonts.checked }), ...extrasProblems(extras) }), [draft, extras, options.slugs, fonts]);
  const count = Object.keys(problems).length;
  const submit = () => {
    setTried(true);
    if (count) return;
    void create.start({ source: "form", brand: draftToBrand(draft), closingRules: closingRulesOf(draft.closingKeywords), ...extrasToRequest(extras) });
  };
  const shown = tried ? problems : filterTouched(problems, draft);
  return (
    <>
      <BrandFields draft={draft} onChange={setDraft} options={options} fonts={fonts} problems={shown} />
      <Extras value={extras} onChange={setExtras} options={options} brandName={draft.name} colors={draft.colors} problems={shown} voiceBrand={voiceBrandOf(draft)} characterBrand={characterBrandOf(draft)} />
      <div className="create-bar">
        <span className={count && tried ? "error" : "muted"}>{count && tried ? `${count} ${count === 1 ? "field needs" : "fields need"} fixing.` : SLUG_OK.test(draft.slug) ? `Creates brand/${draft.slug}/, reels/${draft.slug}/ and the hub's data folder for it.` : "Fill in the name to begin."}</span>
        <span className="grow" />
        <button type="button" className="btn primary" disabled={create.busy} onClick={submit}>{create.busy ? "Creating" : "Create brand"}</button>
      </div>
      <CreateStatus job={create.job} error={create.error} />
    </>
  );
}

/** Before the first press of Create only problems of fields the person has begun to fill are shown (an empty form is not an error list). */
function filterTouched(p: Readonly<Record<string, string>>, d: BrandDraft): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === "name" || k === "slug") { if (d.name) out[k] = v; } else if (k.startsWith("closing") || k.startsWith("offer")) { if (d.name) out[k] = v; } else out[k] = v;
  }
  return out;
}
