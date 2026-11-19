import { useState } from "react";
import { api, type CreatorOptions, type FontList } from "../api";
import { useLoad } from "../hooks";
import { FormEntry } from "../creator/FormEntry";
import { ImportEntry } from "../creator/ImportEntry";
import { InterviewEntry } from "../creator/InterviewEntry";
import type { Created } from "../creator/useCreate";

type Entry = "form" | "interview" | "import";
const ENTRIES: [Entry, string, string][] = [
  ["form", "Fill in a form", "You know the brand. All the details on one page, with live checks."],
  ["interview", "Discuss it with an AI", "An assistant asks one question at a time and writes the brand for you to review."],
  ["import", "Import a folder or zip", "Bring a brand made on another machine. Nothing existing is overwritten."],
];

export function NewBrandPage({ onCreated }: { onCreated: (c: Created) => void }) {
  const [entry, setEntry] = useState<Entry>("form");
  // An entry the person has opened stays mounted (hidden), so switching tabs never loses a half-filled form or restarts the interview.
  const [seen, setSeen] = useState<ReadonlySet<Entry>>(new Set(["form"]));
  const opts = useLoad<CreatorOptions>(api.creatorOptions);
  const fonts = useLoad<FontList>(api.fonts);
  return (
    <>
      <h1>New brand</h1>
      <p className="sub">Each brand has its own hub: its own questions, reels, calendar, Instagram login and settings. Choose how to describe it. Everything is made for you: folders, files and the brand's data.</p>
      <div className="entries" role="tablist" aria-label="How to create the brand">
        {ENTRIES.map(([id, title, text]) => (
          <button key={id} type="button" role="tab" aria-selected={entry === id} className={`entry ${entry === id ? "on" : ""}`} onClick={() => { setEntry(id); setSeen(new Set([...seen, id])); }}>
            <strong>{title}</strong><span>{text}</span>
          </button>
        ))}
      </div>
      {(opts.error || fonts.error) && <p className="error">{opts.error ?? fonts.error}</p>}
      {opts.data && fonts.data && (
        <div className="set-main creator">
          <div hidden={entry !== "form"}><FormEntry options={opts.data} fonts={fonts.data} onCreated={onCreated} /></div>
          {seen.has("interview") && <div hidden={entry !== "interview"}><InterviewEntry options={opts.data} onCreated={onCreated} /></div>}
          {seen.has("import") && <div hidden={entry !== "import"}><ImportEntry options={opts.data} onCreated={onCreated} /></div>}
        </div>
      )}
    </>
  );
}
