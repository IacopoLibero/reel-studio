import { buildApp } from "./app.js";
import { brandsDirOf } from "./brands/paths.js";
import { loadConfig } from "./config.js";
import { defaultProgramRoot } from "./paths.js";
import { makeDailyDeps } from "./routes/daily.js";
import { startDailyLoops } from "./daily/loops.js";
import { existsSync } from "node:fs";
import { runPrepare } from "./layout/prepare.js";
import { ensureToolBin, withToolPath } from "./setup/bin.js";
import { readSetup } from "./setup/state.js";
import { voiceMode } from "./setup/voice-modes.js";
import { realSupervisorDeps, voiceProject } from "./setup/voice-install.js";
import { VoiceSupervisor } from "./setup/voice-supervisor.js";
import { join } from "node:path";

const config = loadConfig();
// Where the brand folders are, for the Remotion config of every job (remotion.config.ts reads it).
process.env.REEL_BRANDS_DIR = brandsDirOf(config.dataDir);
process.env.REEL_PROGRAM = defaultProgramRoot(); // where the common sounds (sfx/) and the skills library are
// At every start: the program's files go into the workspace, the app's own Blender is on the PATH, and the hub keeps VoiceStudio running.
if (config.root !== defaultProgramRoot()) runPrepare(process.stdout, { REEL_ROOT: config.root, PROGRAM_ROOT: defaultProgramRoot() });
ensureToolBin(config.dataDir);
process.env.PATH = withToolPath(config.dataDir);
const { app, deps } = await buildApp(config);
const voicePort = Number(process.env.VOICE_PORT ?? 3900);
const startVoice = (): void => {
  const mode = voiceMode(readSetup(config.dataDir).voiceMode);
  if (!mode?.device || !existsSync(join(voiceProject(config.dataDir), "pyproject.toml"))) return;
  voice = new VoiceSupervisor(realSupervisorDeps({ dataDir: config.dataDir, port: voicePort }, mode, (l) => console.log(l)));
  void voice.start();
};
let voice: VoiceSupervisor | null = null;
deps.hooks.voiceInstalled = () => { voice?.stop(); startVoice(); };
startVoice();
deps.runner.start();
const loops = startDailyLoops(deps.brands, (b) => makeDailyDeps(deps, b));
deps.hooks.ensureDaily = loops.ensure;
await app.listen({ port: config.port, host: config.host });

const shutdown = () => { voice?.stop(); deps.store.flush(); void app.close().finally(() => process.exit(0)); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
