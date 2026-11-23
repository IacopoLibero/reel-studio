import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { api } from "../api";

export function ClaudePage() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Connecting");
  const [tool, setTool] = useState<"claude" | "codex" | null>(null);
  useEffect(() => { api.ai().then((d) => setTool(d.tool)).catch(() => setTool("claude")); }, []);
  useEffect(() => {
    if (!host.current) return;
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
  }, []);
  return (
    <>
      <div className="row"><h1 className="grow">Terminal</h1><span className="muted">{status}</span></div>
      <p className="sub">{tool === "codex" ? "Codex (not tested)" : "Claude Code"} in the project folder (the tool chosen in Settings > AI tool). The session survives page reloads.</p>
      <div className="term" ref={host} />
    </>
  );
}
