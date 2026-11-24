import { useEffect, useState } from "react";
import type { BrandSummary, Job, MoveInfo } from "../../src/shared/types";
import { api } from "../api";
import { useLoad } from "../hooks";
import { JobCard } from "../components/JobCard";
import { MovePreview, frameUrl } from "../components/MovePreview";
import { CharacterStudio } from "../components/CharacterStudio";

export function CharacterPage({ jobs, brand }: { jobs: Job[]; brand: BrandSummary }) {
  return (
    <>
      {brand.character.enabled ? <ExistingCharacter jobs={jobs} character={brand.character} /> : (
        <>
          <h1>Character</h1>
          <p className="sub">{brand.name} has no character, and that is fine: its reels use the full-width layout and work completely. If you want a mascot, you can try to make one below.</p>
        </>
      )}
      {/* The builder (a character from a picture) is only for a brand that has no character yet. */}
      {!brand.character.enabled && <CharacterStudio jobs={jobs} brand={brand} />}
    </>
  );
}

function ExistingCharacter({ jobs, character }: { jobs: Job[]; character: { id: string; name: string } }) {
  const { data, error, reload } = useLoad(api.moves);
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [request, setRequest] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const moveJobs = jobs.filter((j) => j.type === "claude.task" || j.type === "blender.render");
  const activeCount = moveJobs.filter((j) => j.status === "running" || j.status === "queued").length;
  useEffect(reload, [activeCount]);
  const moves = data ?? [];
  const current = moves.find((m) => m.name === sel) ?? null;
  const create = (type: string, params: Record<string, unknown>) => api.createJob(type, params).then(() => setMsg("Job started. Follow it below.")).catch((e: Error) => setMsg(e.message));
  const list = (kind: MoveInfo["kind"]) => moves.filter((m) => m.kind === kind);
  return (
    <>
      <h1>Character</h1>
      <p className="sub">{character.name || character.id}, the brand's character. Every move found in public/mascot.</p>
      {error && <p className="error">{error}</p>}
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <label className="row" style={{ margin: 0, color: "var(--text)" }}><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Mouth open</label>
        <span className="muted">{moves.length} moves and faces</span>
      </div>
      <div className="grid">
        {moves.map((m) => (
          <button key={m.name} className={`tile ${sel === m.name ? "on" : ""}`} onClick={() => setSel(m.name)}>
            {m.rendered ? <MovePreview move={m} open={open} size={170} /> : <img alt="" src={frameUrl(m.name, 0, false)} style={{ visibility: "hidden" }} />}
            <div><strong>{m.name}</strong> <span className="muted">{m.frames} frames · {m.kind}</span></div>
          </button>
        ))}
      </div>
      {current && (
        <div className="card row" style={{ marginTop: 12 }}>
          <div className="grow"><strong>{current.name}</strong>
            <div className="muted">{current.kind === "face" ? `Holds a pose, loops from frame ${current.loopFrom}` : "Plays as a move"} · {character.id}.py {current.inScript ? "yes" : "no"} · Mascot.tsx {current.inMascot ? "yes" : "no"} · {current.renderedFrames} rendered frames</div>
          </div>
          <button className="btn" disabled={!current.inScript} title={current.inScript ? "" : `Not registered in ${character.id}.py`} onClick={() => create("blender.render", { move: current.name })}>Re-render this move</button>
        </div>
      )}
      <h2>Moves</h2>
      <div className="chips">{list("move").map((m) => <span className="badge" key={m.name}>{m.name}</span>)}</div>
      <h2>Faces</h2>
      <div className="chips">{list("face").map((m) => <span className="badge" key={m.name}>{m.name}</span>)}</div>
      <h2>Add to {character.name || character.id} with Claude</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>Claude writes the move in {character.id}.py, registers it, renders it with Blender and sums up.</p>
        <label>Move name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="high_five" />
        <label>What should it do?</label>
        <textarea rows={4} value={request} onChange={(e) => setRequest(e.target.value)} placeholder="The character jumps and claps both hands above its head, then lands." />
        <p><button className="btn primary" disabled={!/^[a-z][a-z0-9_]{0,39}$/.test(name) || request.trim().length < 5} onClick={() => create("claude.task", { move: name, request })}>Add with Claude</button></p>
        {msg && <p className="muted">{msg}</p>}
      </div>
      {moveJobs.slice(0, 5).map((j) => <JobCard key={j.id} job={j} open={j.status === "running"} />)}
    </>
  );
}
