import { existsSync } from "node:fs";
import { join } from "node:path";

/** One thing Reel Studio needs on this computer, as the setup screen shows it. */
export interface SetupItem {
  id: string;
  label: string;
  status: "ok" | "missing";
  /** A blocker: the app cannot make reels without it. Information items (the GPU) are not. */
  required: boolean;
  /** The app can install it from the setup screen. When false the user installs it (see `hint`). */
  auto: boolean;
  detail: string;
  hint: string;
}

export interface CheckContext {
  /** Path of a program on the PATH (or in the app's own tools folder), or null. */
  which: (name: string) => string | null;
  workspace: string;
  dataDir: string;
  nodeVersion: string;
  /** Name of the NVIDIA graphics card, or null. */
  gpu: string | null;
}

/** Where the tools the app installs itself live (Blender, VoiceStudio): `<data>/tools/<name>/`. */
export const toolsDir = (dataDir: string, name: string): string => join(dataDir, "tools", name);

const MIN_NODE = [22, 13];
const nodeOk = (v: string): boolean => {
  const [maj = 0, min = 0] = v.split(".").map(Number);
  return maj > MIN_NODE[0]! || (maj === MIN_NODE[0] && min >= MIN_NODE[1]!);
};
const first = (which: CheckContext["which"], names: string[]): string | null => names.map(which).find((p): p is string => !!p) ?? null;

function tool(id: string, label: string, found: string | null, hint: string, required = true): SetupItem {
  return { id, label, status: found ? "ok" : "missing", required, auto: false, detail: found ?? "not found", hint };
}

/** The list the setup screen shows. Pure: everything it looks at comes from `ctx`, so it is easy to test. */
export function runChecks(ctx: CheckContext): SetupItem[] {
  const blender = first(ctx.which, ["blender"]) ?? [join(toolsDir(ctx.dataDir, "blender"), "blender")].find(existsSync) ?? null;
  const voiceProject = join(toolsDir(ctx.dataDir, "voicestudio"), "project", "pyproject.toml");
  return [
    { id: "node", label: "Node.js 22.13 or newer", status: nodeOk(ctx.nodeVersion) ? "ok" : "missing", required: true, auto: false, detail: ctx.nodeVersion, hint: "sudo pacman -S nodejs npm" },
    tool("claude", "Claude Code", first(ctx.which, ["claude"]), "Install Claude Code, then run `claude` once to log in."),
    tool("chromium", "Chromium or Google Chrome (Instagram scheduling, covers)", first(ctx.which, ["chromium", "google-chrome-stable", "google-chrome"]), "sudo pacman -S chromium"),
    tool("ffmpeg", "FFmpeg (video and audio)", first(ctx.which, ["ffmpeg"]), "sudo pacman -S ffmpeg"),
    tool("git", "Git", first(ctx.which, ["git"]), "sudo pacman -S git"),
    tool("uv", "uv (installs the voice's Python packages)", first(ctx.which, ["uv"]), "sudo pacman -S uv", false),
    { ...tool("build-tools", "Build tools (make, g++): they build whisper.cpp", ctx.which("make") && ctx.which("g++") ? "make, g++" : null, "sudo pacman -S base-devel"), required: true },
    { id: "workspace-packages", label: "Remotion and the video packages", status: existsSync(join(ctx.workspace, "node_modules", "remotion", "package.json")) ? "ok" : "missing", required: true, auto: true, detail: ctx.workspace, hint: "The app installs them (about 600 MB)." },
    { id: "whisper", label: "Whisper (times each word of the narration)", status: existsSync(join(ctx.workspace, "whisper.cpp", "main")) && existsSync(join(ctx.workspace, "whisper.cpp", "ggml-medium.bin")) ? "ok" : "missing", required: true, auto: true, detail: join(ctx.workspace, "whisper.cpp"), hint: "The app builds whisper.cpp and downloads its model (about 1.5 GB)." },
    { ...tool("blender", "Blender (the character)", blender, "The app downloads Blender, or install it with `sudo pacman -S blender`.", false), auto: true },
    { id: "voicestudio", label: "VoiceStudio (the voice)", status: existsSync(voiceProject) ? "ok" : "missing", required: false, auto: true, detail: toolsDir(ctx.dataDir, "voicestudio"), hint: "The app installs it with the voice mode you choose." },
    { id: "gpu", label: "NVIDIA graphics card (faster voice)", status: ctx.gpu ? "ok" : "missing", required: false, auto: false, detail: ctx.gpu ?? "none found", hint: "Not needed: the processor modes work without it." },
  ];
}
