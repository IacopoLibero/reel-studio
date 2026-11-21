---
name: reel-hooks
description: Write and rank the opening question of a reel for the brand's audience. Use when the person asks for a hook, an opening line, the first 3 seconds, a scroll stopper, or "why did this reel flop", and whenever reel.ideas or the reel skill shapes an opening question. Optional A/B comparison of two hooks.
---
<!-- Adapted from the MIT-licensed Ootto skills virality, going-viral, viral-hook-writer and ab-hook-tester (https://github.com/Ootto-AI/claude-content-skills). -->

# Reel hooks

The hook is the opening question of the reel. It is on screen at frame 0 and spoken first. Audience: the people the brand's reels are for (`audience` in `<brand folder>/identity/brand.json`; read it and `style.md` first).

## Rules
1. **First 3 seconds checklist.** Something specific happens on screen at once: a drawing moves, a number counts, a thing breaks or fills. The question is fully readable on frame 0.
   - Wins: a concrete loss or gain for the owner, a belief to break, a clear number, one easy step, a question naming a pain they live every day.
   - Flops: a title card, a logo fade, "Hi, today I want to talk about", a broad topic with no stake, a question answered by "it depends".
2. **Pick the goal emotion first**, one per reel: fear (what you could lose), curiosity (a gap to close), myth, money, effort (how easy), identity, proof, number. Say which.
3. **Ten openings, ranked.** Under 14 words each, spoken language, a real question, no hashtags, no invented figures. Spread the angles: contrarian, "what happens when", mistake, number plus payoff, curiosity gap, result first, pain named. Mark the three to test first and say why in one line.
4. Stay true: a hook promises only what the source supports. Fear is about real risks (rules, wrong prices, lost guests), never invented ones.
5. Fit the owner's day: lunch rush, staff, allergens, menu prices, Google reviews, empty tables.
6. **Optional A/B:** when asked for two hooks, compare them on: stop power in 3 seconds, clarity at a glance, stake for the owner, truth. Name a winner and one line why. Do not claim it will win; say what to watch in the first-hour numbers.
7. If `data/analytics/hooks.csv` exists, prefer patterns of the hooks that won there.

## Output format
Same as the question list in `<brand folder>/reel-questions.md`, one line each:
`- [ ] <opening question> · hook: <emotion> · source: <blog-slug or needs source>`
Then: `Test first: 1, 4, 7. Why: ...` and, for an A/B, `Winner: A. Why: ...`.
Hooks and reel text stay in English.
