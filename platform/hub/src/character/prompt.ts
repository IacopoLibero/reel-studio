import { existsSync } from "node:fs";
import { delimiter } from "node:path";

export const ALLOWED_TOOLS = "Read,Edit,Write,Glob,Grep,Bash(blender-run:*),Bash(flatpak run:*)";

export const onPath = (bin: string, pathVar: string) => pathVar.split(delimiter).some((d) => d && existsSync(`${d}/${bin}`));

/** The Blender command for a script: the blender-run wrapper when on PATH, else the flatpak. `tail` goes after the `--`. */
export function blenderCommand(script: string, tail: string[], pathVar = process.env.PATH ?? ""): { cmd: string; args: string[]; text: string } {
  const args0 = ["-b", "-P", script, "--", ...tail];
  const [cmd, args] = onPath("blender-run", pathVar)
    ? ["blender-run", args0] as const
    : ["flatpak", ["run", "--filesystem=home", "org.blender.Blender", ...args0]] as const;
  return { cmd, args: [...args], text: [cmd, ...args].join(" ") };
}

/** The Blender command for rendering a move of a character: the script is brand/<slug>/mascot/<id>.py, and it writes next to itself (movements/<move>/). */
export const renderCommand = (script: string, move: string, pathVar?: string) => blenderCommand(script, ["move", move], pathVar);

export function buildAddMovePrompt(root: string, mascotDir: string, character: { id: string; name: string }, move: string, request: string, pathVar?: string): string {
  const { id, name } = character;
  const script = `${mascotDir}/${id}.py`;
  const render = renderCommand(script, move, pathVar).text;
  return `You are working in the reel-studio project at ${root}. Add a new move for the character ${name || id}.

What the user wants:
${request.trim()}

Rules for adding a move:
1. Read ${script} and ${root}/src/mascot/Mascot.tsx first, and follow how the existing moves are written.
2. Name the move \`${move}\`. Write it as a new function \`m_${move}(f)\` in ${script}, next to the other m_* functions.
3. Register it in MOVES in ${script} (name: (function, frames)). If it holds a pose and loops, also add it to LOOP_FROM in both files.
4. Register its frame count in MOVE_FRAMES in src/mascot/Mascot.tsx (keep it in step with ${script}).
5. Render it with this exact command (absolute script path, Blender has no window):
   ${render}
   Do not render other moves. Wait for it to finish.
6. Check that ${mascotDir}/movements/${move}/ now holds f-NNNN.png, o-NNNN.png and info.json.
7. Finish with a short summary: what the move does, its frame count, and the files you changed.
Do not touch anything else in the project.`;
}
