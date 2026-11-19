---
name: reel-insights
description: Read the analytics of the reels and say in plain words what to repeat, what to stop and which hooks won. Use for "how are my reels doing", "readout", "what worked", "report", "audit my content", daily analysis, or proposals to improve the brand rules.
---
<!-- Adapted from the MIT-licensed Ootto skills analytics-readout, content-audit, social-analytics-report, positioning-audit and community-engagement-plan (https://github.com/Ootto-AI/claude-content-skills). -->

# Reel insights

## Data
- `data/analytics/<date>.json`: snapshots, per reel: id, permalink, caption start, posted at, reach, plays, likes, comments, saves, shares, average watch time (some may be missing).
- `data/analytics/hooks.csv`: hook (opening question), plays, reach, saves, shares, likes, comments, posted_at, reel. Use the newest snapshot; compare with older ones for trends.
- Read the files, do not guess. A new post may have no insights yet: say "too early", do not treat it as a flop. Missing metric: say so, never invent it.

## Rules
1. Rank by what matters for a restaurant brand: saves and shares first (people keep it or pass it on), then plays and watch time, then comments.
2. Compare like with like: the same age of post, closing A versus closing B, hook emotion, topic.
3. With fewer than 8 reels, say the sample is small and keep claims modest. Never claim cause from one reel.
4. Find hook patterns that won and lost (use hook-mining on hooks.csv when it has 8 or more rows).
5. Check the brand fit: does what wins match the voice and the offer in `brand/<brand>/style.md`? Comment themes: note questions viewers ask, as ideas.
6. Proposals are only proposals: a change to `style.md` or the question rules is written as "Proposal: ..." with the number behind it. Never apply one without the user's approval.

## Output
When addressed to the user: plain Italian, short sentences, no jargon, owner-friendly.
```
Come sta andando: <2 lines>
Da ripetere: <up to 3, with the number>
Da smettere: <up to 3, with the number>
Hook che hanno funzionato: <pattern and example>
Proposte: <1-3, each with why>
```
Scripts, hooks and reel text stay English.
