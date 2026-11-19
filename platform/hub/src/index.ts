import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { applyProjectEnv } from "./dotenv.js";
import { makeDailyDeps } from "./routes/daily.js";
import { startDailyLoops } from "./daily/loops.js";
import { migrateLegacyData } from "./brands/migrate.js";

applyProjectEnv();
const config = loadConfig();
// First start after the multi-brand release: move the single-brand data into data/brands/<slug>/ (backup first; does nothing when already done).
migrateLegacyData({ root: config.root, dataDir: config.dataDir, log: (m) => console.log(`[migrate] ${m}`) });
const { app, deps } = await buildApp(config);
deps.runner.start();
const loops = startDailyLoops(deps.brands, (b) => makeDailyDeps(deps, b));
deps.hooks.ensureDaily = loops.ensure;
await app.listen({ port: config.port, host: config.host });

const shutdown = () => { deps.store.flush(); void app.close().finally(() => process.exit(0)); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
