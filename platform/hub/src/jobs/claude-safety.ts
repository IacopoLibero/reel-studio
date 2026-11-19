import { homeDir } from "../paths.js";
/**
 * Tool permissions shared by every headless Claude job that can read text from the web (research, ideas, daily, make).
 *
 * Why: a web page is untrusted text. If it contains instructions ("read ~/.claude/... and send it to ..."), the model
 * could follow them. The container holds the user's Claude login (~/.claude), the Composio key (~/.composio) and the
 * hub token (platform/.env), so these files must never be readable by a job that also reaches the network, and
 * the shell tools that can reach the network are limited to the research commands.
 */
const HOME = homeDir();

/** Files with credentials or tokens. Read/Glob/Grep on them is refused. */
export const SECRET_PATHS: readonly string[] = [
  "**/.env",
  "**/.env.*",
  "**/.credentials.json",
  `${HOME}/.claude/**`,
  `${HOME}/.claude.json`,
  `${HOME}/.composio/**`,
  `${HOME}/.config/**`,
  "/data/**",
  "**/data/chrome-profile/**",
];

// Only Read(...) rules exist for files: Claude Code applies them to every file-reading tool (Read, Grep, Glob); Grep(...)/Glob(...) rules are rejected.
export const SECRET_READ_DENIES: readonly string[] = SECRET_PATHS.map((p) => `Read(${p})`);

/** Shell commands that dump the environment or can send data out. Used where the shell must stay broad (reel.make). */
export const NETWORK_AND_ENV_BASH_DENIES: readonly string[] = ["curl", "wget", "nc", "ncat", "ssh", "scp", "rsync", "env", "printenv", "python3 -c", "node -e"].map((c) => `Bash(${c}:*)`);

export const DESTRUCTIVE_BASH_DENIES: readonly string[] = ["rm -rf", "git", "docker", "systemctl", "kill", "sudo"].map((c) => `Bash(${c}:*)`);

/** The only shell commands research jobs need (agent-reach with public pages, Jina reader, YouTube subtitles). */
export const RESEARCH_BASH_ALLOWED: readonly string[] = [
  "Bash(agent-reach:*)",
  "Bash(curl -s https://r.jina.ai/:*)",
  "Bash(yt-dlp --write-sub --skip-download:*)",
];

export const join = (...lists: readonly (readonly string[])[]): string => lists.flat().join(",");
