import { describe, it, expect } from "vitest";
import { parseQuestions, questionId, tickQuestion } from "../src/factory/questions.js";

const md = `# Title

## Done

- [x] Hi, I'm Buddy: who is the fork? · hook: curiosity · \`0-buddy-intro\`
- [x] Is a paper menu really cheaper? · hook: myth · \`12-paper-menu-really-cheaper\` · closing A · source: \`digital-menu-restaurants-complete-guide\`
- [x] Do guests really hate QR menus? · hook: myth · \`11-guests-hate-qr-menus\` · closing A · source: needs source
- [x] What marketing brings customers? · hook: money · \`5-f1\` · source: Lightspeed article

## To do

### Fear: what you could lose
- [ ] What does one wrong order cost? · source: \`reduce-order-errors-restaurant\`
- [ ] No source here?

### Money and time
- [ ] How do you stop reprinting? · source: needs source
`;

describe("parseQuestions", () => {
  const q = parseQuestions(md, "acme");
  it("reads every question with its section", () => {
    expect(q).toHaveLength(7);
    expect(q.filter((x) => x.done)).toHaveLength(4);
    expect(q.filter((x) => !x.done)).toHaveLength(3);
    expect(q.every((x) => x.brand === "acme")).toBe(true);
  });
  it("reads done fields", () => {
    expect(q[0]).toMatchObject({ question: "Hi, I'm Buddy: who is the fork?", hook: "curiosity", folder: "0-buddy-intro", closing: null, source: null, sourceKind: "other", section: "Done" });
    expect(q[1]).toMatchObject({ folder: "12-paper-menu-really-cheaper", closing: "A", source: "digital-menu-restaurants-complete-guide", sourceKind: "blog" });
    expect(q[2]).toMatchObject({ sourceKind: "needs-source", source: "needs source" });
    expect(q[3]).toMatchObject({ source: "Lightspeed article", sourceKind: "other" });
  });
  it("takes the hook from the sub-heading and tolerates missing fields", () => {
    expect(q[4]).toMatchObject({ hook: "fear", section: "Fear: what you could lose", folder: null, sourceKind: "blog", done: false });
    expect(q[5]).toMatchObject({ source: null, sourceKind: "other", hook: "fear" });
    expect(q[6]).toMatchObject({ hook: "money", sourceKind: "needs-source" });
  });
  it("has stable distinct ids", () => {
    expect(q[0]!.id).toBe(questionId("Hi, I'm Buddy: who is the fork?"));
    expect(new Set(q.map((x) => x.id)).size).toBe(7);
    expect(questionId("a")).toMatch(/^[0-9a-f]{12}$/);
  });
  it("ignores unrelated text", () => {
    expect(parseQuestions("hello\n- [ ] orphan before a section", "b")).toHaveLength(1);
    expect(parseQuestions("", "b")).toEqual([]);
  });
});

describe("tickQuestion", () => {
  it("ticks, adds folder and closing, and moves the line to Done", () => {
    const out = tickQuestion(md, "What does one wrong order cost?", "22-wrong-order", "B");
    const q = parseQuestions(out, "e");
    const t = q.find((x) => x.question.startsWith("What does one wrong"))!;
    expect(t).toMatchObject({ done: true, folder: "22-wrong-order", closing: "B", hook: "fear", source: "reduce-order-errors-restaurant" });
    expect(q).toHaveLength(7);
    expect(out.indexOf("22-wrong-order")).toBeLessThan(out.indexOf("## To do"));
  });
  it("is a no-op when the question is missing or already done", () => {
    expect(tickQuestion(md, "nope", "1-x", "A")).toBe(md);
    expect(tickQuestion(md, "Is a paper menu really cheaper?", "9-x", "B")).toBe(md);
  });
});
