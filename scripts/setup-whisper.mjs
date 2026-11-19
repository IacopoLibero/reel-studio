// Installs whisper.cpp (1.5.5) and the "medium" model into <project>/whisper.cpp. Safe to run again: finished steps are skipped.
// Run it where the reels are made (inside the container), because the binary is built for that system.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { installWhisperCpp, downloadWhisperModel } from "@remotion/install-whisper-cpp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const to = path.join(root, "whisper.cpp");
const marker = path.join(to, ".built-in-container");
const model = path.join(to, "ggml-medium.bin");

if (!fs.existsSync(path.join(to, "main"))) {
  // installWhisperCpp refuses a folder that already exists, and in the container whisper.cpp is a Docker volume mount point
  // (always present, empty at first). So build next to it and copy the result in.
  const tmp = `${to}.build`;
  fs.rmSync(tmp, { recursive: true, force: true });
  await installWhisperCpp({ to: tmp, version: "1.5.5", printOutput: true });
  fs.mkdirSync(to, { recursive: true });
  const cp = spawnSync("cp", ["-a", `${tmp}/.`, `${to}/`], { stdio: "inherit" });
  if (cp.status !== 0) throw new Error("could not copy whisper.cpp into place");
  fs.rmSync(tmp, { recursive: true, force: true });
}
fs.writeFileSync(marker, "");
if (!fs.existsSync(model)) {
  let lastTenth = -1;
  await downloadWhisperModel({
    model: "medium", folder: to, printOutput: false,
    onProgress: (done, total) => {
      const tenth = Math.floor((done / total) * 10);
      if (tenth !== lastTenth) { lastTenth = tenth; console.log(`whisper model: ${tenth * 10}%`); }
    },
  });
}
console.log("whisper ready in", to);
