import type { FastifyInstance } from "fastify";
import { countByRisk, makeChangeSchema, OttoSkills, OUR_SKILLS, visibleSkills, type OttoSkill } from "../skills/ootto.js";

export function skillRoutes(app: FastifyInstance, root: string): void {
  const skills = new OttoSkills(root);
  const view = (list: OttoSkill[]) => { const shown = visibleSkills(list); return { skills: shown, counts: countByRisk(shown), ours: OUR_SKILLS }; };
  const fail = (e: unknown) => ({ error: (e as Error).message });

  app.get("/api/skills", async (_req, reply) => {
    try { return view(await skills.list()); } catch (e) { return reply.code(500).send(fail(e)); }
  });

  app.post("/api/skills", async (req, reply) => {
    try {
      const parsed = makeChangeSchema(visibleSkills(await skills.list())).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid request." });
      return view(await skills.apply(parsed.data));
    } catch (e) { return reply.code(500).send(fail(e)); }
  });

  app.post("/api/skills/reset", async (_req, reply) => {
    try { return view(await skills.reset()); } catch (e) { return reply.code(500).send(fail(e)); }
  });
}
