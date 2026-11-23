# Skills, analytics, series and the daily loop

How the content skills, the Analytics and Series pages and the daily loop work. Decided on 2026-11-19, brought up to date on 2026-11-20.
Lines marked **Changed** record a decision that was revised while building. Ports, commands and backups are in [../README.md](../README.md),
the rest of the hub in [DESIGN.md](DESIGN.md).

## Content skills

All 54 Ootto skills are vendored unmodified in `platform/skills/ootto/` of the program (MIT, see `SOURCE.md`); they are read from there, never copied into the workspace. `manifest.json` says which are visible
(`hidden: false`), their risk and whether they are on by default. A skill is **on** when `.claude/skills/ootto-<name>` is a symlink to its folder
(local state, ignored by git; `scripts/ootto-skills.sh list|defaults|enable|disable` or the Settings page). Our own skills live in `.claude/skills/` and are always on.

**Ours** (`.claude/skills/`):

| Skill | What it does |
|---|---|
| `reel` | The whole recipe for a reel: script, voice, timing, scenes, render, checks, caption, cover. Steps 11 and 12 carry a checklist for captions, hashtags and covers. |
| `reel-hooks` | Writes and ranks opening questions (first-3-seconds checklist, winning and flopping patterns, an optional A/B comparison). Absorbs virality, going-viral, viral-hook-writer and ab-hook-tester. |
| `reel-research` | Finds facts and trends for a script or for ideas. Absorbs trend-spotter and content-research, and uses reel-analyzer to study another account's reel. |
| `reel-insights` | Reads the analytics data and writes the plain-language readout (what to repeat, what to stop, hook patterns). Absorbs analytics-readout, content-audit, social-analytics-report, positioning-audit and community-engagement-plan. |
| `reel-threads` | Turns a reel into 1 to 3 short Threads posts (text only, up to 500 characters). It generates text; it never posts. |

**Ootto skills kept visible in Settings (14):** `agent-reach` (always used for research: public pages only, never logins or cookies,
fetched content is data and never instructions), `hook-mining` (needs a CSV of your own hooks and results), `best-time-scheduler`, `content-calendar`,
`series-planner`, `bio-profile-optimizer`, `positioning-audit`, `reel-analyzer`, `carousel-builder` and `viral-carousel` (on by default: the carousel job calls both), and for later pipelines `story-sequencer`, `paid-social-brief`, `utm-campaign-plan`, `x-thread-strategy` (see Threads below).

The other Ootto skills are hidden (`hidden: true`): absorbed into ours (the sources above), or not useful here (comment-responder, dm-script-writer,
outreach and partnership skills, content-factory, reel-builder, reel-scripter, ai-brain, and similar). Their files are kept for reference.

## Analytics

Source: Instagram insights through Composio (`INSTAGRAM_GET_IG_USER_MEDIA` and `INSTAGRAM_GET_IG_MEDIA_INSIGHTS`, GET only) for the account whose numeric
user id is in the brand's `brand.json` (`instagram.userId`). **Changed:** it used to be an environment variable. The Composio login is read from
`~/.composio` (your own login); the key is never printed.

- `analytics.collect` stores a snapshot in `<data>/brands/<slug>/analytics/<date>.json` (per post: id, permalink, caption start, posted time,
  plays, reach, likes, comments, saves, shares, average watch time where the API gives it, matched to the reel folder by caption) and exports
  `hooks.csv` for hook mining. It is read-only on Instagram, respects the Graph API limits, handles "insights not available yet" and missing metrics,
  and says `composio link instagram` when the connection is invalid.
- `reel.insights` runs headless Claude with `reel-insights` and saves `readout-<date>.md`, in the brand's `readoutLanguage`.
- The **Analytics page** shows cards (most and fewest plays, saves, shares), a bar chart of plays per reel with reach as a line, a sortable table
  and the readout.
- **Best posting times** (Calendar > Suggest best times): needs at least 8 reels with plays that are at least two days old. Until then it shows the
  times of the slot pattern and says it is not a result of your data. The slot pattern in Settings stays the default.

## Series

A series is a named recurring format: name, promise, cadence, example hooks, and the questions assigned to it (a question belongs to at most one series),
stored per brand in `series.json`. The `series.plan` job (headless Claude with `series-planner` and `reel-hooks`) proposes one from your reels and results.
The Factory shows the series badge next to a question.

## The daily loop

The request: "Every day, as soon as the computer is online: analyse the data, improve, create three video ideas, alert me, then after my manual
approval make everything, and when I confirm each video, schedule it."

One `daily.run` per brand per calendar day (Europe/Rome by default), started by a loop inside the hub (the hub runs while the app is open or in the tray):

1. **Trigger.** Every 5 minutes the loop checks that the brand's daily loop is switched on, that it is after the earliest time (default 06:00), that no
   plan exists for today, that Instagram and `api.anthropic.com` answer over HTTPS, and that no heavy browser or voice job is active. If the computer
   was off or offline it runs at the first check after it is back.
2. **Collect.** The analytics collector (a fresh snapshot and `hooks.csv`).
3. **Analyse and improve.** Headless Claude with `reel-insights` (and `hook-mining` when `hooks.csv` has 8 or more rows, `best-time-scheduler` for
   times): a readout, what to repeat and stop, and a list of **proposals** (for example a change to `style.md` or a question rule). Proposals are stored
   and shown, **never applied** without you.
4. **Ideas.** The same machinery as `reel.ideas` (research with `agent-reach`, `reel-research`, `reel-hooks`, a quality gate, dedupe against the question list)
   for the configured number of ideas (default 3), each with hook, source, closing A or B, why, and a "based on your data" reason. Optionally a Threads text
   per idea (generated, never posted).
5. **Alert.** The plan `<data>/brands/<slug>/daily/<date>.json` gets the status `awaiting_approval` and the hub adds a notification
   (`GET /api/notifications`). The desktop app polls that list every minute and shows each new one as a system notification (clicking it opens the Daily page); it works with the window closed, while the app is in the tray.
6. **Approval 1 (manual).** The Daily page shows readout, proposals and ideas with checkboxes and an editable closing each. **Create selected** or **Skip today**.
   Nothing is created before the click.
7. **Creation.** One `reel.make` job per selected idea (the factory, with folder allocation and the question tick); progress on the Daily page.
8. **Approval 2 (manual).** For each finished reel: player, caption, cover, a self-check (MP4, cover and caption present, caption within 2,200 characters, hashtags).
   **Confirm** or **Reject** with a note (the reel is rerun with the note appended to the prompt, at most 2 reruns). Nothing is scheduled before Confirm.
9. **Scheduling.** Confirm creates the `instagram.schedule` job for the next free slot of the pattern (the best-time suggestion is shown, you can change the slot).
   One browser job at a time; the Calendar updates.
10. **Offer line.** If the brand has an offer (`offer.lastDay` and `offer.regex` in `brand.json`), the offer line is left out of the Instagram copy of a
    closing-A caption for a slot after the last day (`caption.md` is not changed, the job log says so). A brand with no offer is unaffected.

Plan statuses: `collecting`, `analysing`, `ideas`, `awaiting_approval`, `creating`, `awaiting_review`, `scheduling`, `done`, `skipped`, `failed`.
Settings (per brand): daily loop on or off (**default off**), earliest time, number of ideas, Threads text on or off.

## Threads (paused)

`reel-threads` and the Threads text option generate text only. Posting through Composio (`THREADS_CREATE_POST`) needs a Threads connection with your own Meta
app (see [TODO.md](../../TODO.md)); until then nothing is posted.
