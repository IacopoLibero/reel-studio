import { buildApp } from "./app.js";
import { brandsDirOf } from "./brands/paths.js";
import { loadConfig } from "./config.js";
import { defaultProgramRoot } from "./paths.js";
import { applyProjectEnv } from "./dotenv.js";
import { makeDailyDeps } from "./routes/daily.js";
import { startDailyLoops } from "./daily/loops.js";

applyProjectEnv();
const config = loadConfig();
// Where the brand folders are, for the Remotion config of every job (remotion.config.ts reads it).
process.env.REEL_BRANDS_DIR = brandsDirOf(config.dataDir);
process.env.REEL_PROGRAM = defaultProgramRoot(); // where the common sounds (sfx/) and the skills library are
const { app, deps } = await buildApp(config);
deps.runner.start();
const loops = startDailyLoops(deps.brands, (b) => makeDailyDeps(deps, b));
deps.hooks.ensureDaily = loops.ensure;
await app.listen({ port: config.port, host: config.host });

const shutdown = () => { deps.store.flush(); void app.close().finally(() => process.exit(0)); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
