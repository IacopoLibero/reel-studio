import { describe, expect, it } from "vitest";
import { ago, dollars, levelOf, percent, resetsIn } from "../web/ai-usage.js";

const NOW = Date.parse("2026-11-23T10:00:00Z");
const at = (min: number) => Math.round(NOW / 1000) + min * 60;

describe("ai usage helpers", () => {
  it("shows a percentage between 0 and 100", () => {
    expect([percent(0), percent(0.834), percent(1), percent(1.7), percent(-1)]).toEqual([0, 83, 100, 100, 0]);
  });
  it("warns from 70% and alarms from 90%", () => {
    expect([levelOf(0.5), levelOf(0.7), levelOf(0.89), levelOf(0.9), levelOf(1)]).toEqual(["ok", "warn", "warn", "bad", "bad"]);
  });
  it("says when a limit resets", () => {
    expect(resetsIn(at(-5), NOW)).toBe("now");
    expect(resetsIn(at(25), NOW)).toBe("in 25 min");
    expect(resetsIn(at(130), NOW)).toBe("in 2 h 10 min");
    expect(resetsIn(at(180), NOW)).toBe("in 3 h");
    expect(resetsIn(at(60 * 24 * 3), NOW)).toBe("in 3 days");
    expect(resetsIn(at(60 * 24), NOW)).toBe("in 1 day");
    expect(resetsIn(null, NOW)).toBe("");
  });
  it("says how old a reading is", () => {
    expect(ago("2026-11-23T09:59:50Z", NOW)).toBe("just now");
    expect(ago("2026-11-23T09:55:00Z", NOW)).toBe("5 min ago");
    expect(ago("2026-11-23T07:00:00Z", NOW)).toBe("3 h ago");
    expect(ago("2026-11-20T10:00:00Z", NOW)).toBe("3 days ago");
    expect(ago("garbage", NOW)).toBe("just now");
  });
  it("writes small amounts of money readably", () => {
    expect([dollars(0), dollars(0.004), dollars(0.0837), dollars(3.2), dollars(12.6)]).toEqual(["$0", "$0", "$0.08", "$3.20", "$13"]);
  });
});
