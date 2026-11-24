import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { api } from "../api";

type Level = "ask" | "edit" | "plan" | "full";
const LEVELS: { id: Level; label: string }[] = [
  { id: "ask", label: "Ask before each change" }, { id: "edit", label: "Edit files without asking" },
  { id: "plan", label: "Plan only, change nothing" }, { id: "full", label: "Everything, no questions" },
];

export function ClaudePage() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Connecting");
  const [tool, setTool] = useState<"claude" | "codex" | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => { api.ai().then((d) => setTool(d.tool)).catch(() => setTool("claude")); }, []);
  useEffect(() => { api.settings().then((s) => setLevel(s.terminalPermission ?? "ask")).catch(() => setLevel("ask")); }, []);
  // A new level needs a new session (the flags count only at start), so the terminal reconnects.
  const change = async (next: Level) => {
    setProblem("");
    try { const s = await api.settings(); await api.saveSettings({ ...s, terminalPermission: next }); setLevel(next); }
    catch (e) { setProblem(`Could not change the level: ${(e as Error).message}`); }
  };
  useEffect(() => {
    if (!host.current || level === null) return;
    const term = new Terminal({ fontFamily: "ui-monospace, 'JetBrains Mono', monospace", fontSize: 13, cursorBlink: true, theme: { background: "#000000", cursor: "#d94a3d" } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?cols=${term.cols}&rows=${term.rows}`);
    const send = (o: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(o));
    ws.onopen = () => { setStatus("Connected"); term.focus(); };
    ws.onmessage = (e) => term.write(typeof e.data === "string" ? e.data : "");
    ws.onclose = () => setStatus("Disconnected. Reload the page to reconnect.");
    const d = term.onData((data) => send({ type: "input", data }));
    const onResize = () => { fit.fit(); send({ type: "resize", cols: term.cols, rows: term.rows }); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); d.dispose(); ws.close(); term.dispose(); };
  }, [level]);
  return (
    <>
      <div className="row"><h1 className="grow">Terminal</h1><label className="muted" htmlFor="term-level">Permission level </label>
        <select id="term-level" value={level ?? "ask"} onChange={(e) => void change(e.target.value as Level)}>
          {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <span className="muted">{status}</span></div>
      {problem && <p className="error">{problem}</p>}
      {level === "full" && <p className="muted">At this level the tool changes and runs anything without asking.</p>}
      <p className="sub">{tool === "codex" ? "Codex (not tested)" : "Claude Code"} in the project folder, with the data of every brand within reach (the tool chosen in Settings &gt; AI tool). A new level starts a new session; the session survives page reloads.</p>
      <div className="term" ref={host} />
    </>
  );
}
