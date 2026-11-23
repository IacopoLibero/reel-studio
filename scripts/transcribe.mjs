import path from "node:path";
import fs from "node:fs";
import { transcribe, toCaptions } from "@remotion/install-whisper-cpp";

const [, , input, output] = process.argv;
const whisperPath = path.join(process.cwd(), "whisper.cpp");
const result = await transcribe({
  inputPath: path.resolve(input),
  whisperPath,
  whisperCppVersion: "1.5.5",
  model: "medium",
  tokenLevelTimestamps: true,
  language: process.argv[4] || process.env.REEL_LANGUAGE || "en",
});
const { captions } = toCaptions({ whisperCppOutput: result });
fs.writeFileSync(output, JSON.stringify(captions, null, 2));
console.log("words:", captions.length);
