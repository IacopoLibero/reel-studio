import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { applyProjectEnv } from "./dotenv.js";
import { makeDailyDeps } from "./routes/daily.js";
import { startDailyLoops } from "./daily/loops.js";

applyProjectEnv();
const config = loadConfig();
const { app, deps } = await buildApp(config);
deps.runner.start();
const loops = startDailyLoops(deps.brands, (b) => makeDailyDeps(deps, b));
deps.hooks.ensureDaily = loops.ensure;
await app.listen({ port: config.port, host: config.host });

const shutdown = () => { deps.store.flush(); void app.close().finally(() => process.exit(0)); };
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
