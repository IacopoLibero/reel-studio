# My look (edit this file any time, or ask Claude to change it)

Brand: {{BRAND_NAME}} ({{WEBSITE}}). Colours and fonts match the website.

## Colours
- Background: `{{BACKGROUND_HEX}}`
- Text: `{{TEXT_HEX}}`
- Accent: `{{ACCENT_HEX}}`. Use only on what matters.
- Secondary accent (rare, for a second highlight): `{{SECOND_ACCENT_HEX}}`

## Fonts
- Headlines and big words: **{{HEADLINE_FONT}}** (bold)
- Captions and small text: **{{BODY_FONT}}**
- No other fonts. (Any Google font works: Remotion loads it with `@remotion/google-fonts`.)

## Voice
- Engine: VoiceStudio, engine `voxcpm2`, backend `http://localhost:3900`, used only through its local API.
- It runs in the background with no window: the Reel Studio app starts it and keeps it running, with the voice engine the person chose in Settings > Voice. `scripts/voice.mjs` only checks that it answers. Never ask the person to open VoiceStudio's own app and never launch its window.
- Speak with `POST /generate` (multipart: `text`, `language`, `instruct`, optional `ref_audio` + `ref_text`, `guidance_scale=1.6`).
- To keep the same voice in every sentence and every reel, clone from a saved sample: pass the sample as `ref_audio` and its spoken text as `ref_text`.
- Chosen voice: **{{VOICE_NAME}}**, cloned from `{{VOICE_BASE}}.wav` (its words are in `{{VOICE_BASE}}.txt`, optional settings in `{{VOICE_BASE}}.json`). See `.claude/skills/reel/voice-sample.md` for how to record it.
- Word times: Remotion Whisper (`whisper.cpp/`, model medium, installed by `scripts/setup-whisper.mjs`).
- Write scripts in a chatty, spoken style: short sentences, "so", "and", no formal wording.
- If the engine stops with an out-of-memory error, retry once.

## Mascot
- {{MASCOT_DESCRIPTION}} (delete this section if the brand has no mascot.)

## Closing hook (every reel)
- Brand: {{BRAND_NAME}}, `{{WEBSITE}}`. Logo: `{{LOGO_PATH}}`.
- The last spoken sentence is a call to action, 12 words at most. Two options; the person picks one at the start of every reel:
  - **A: {{OFFER_NAME}}.** Names the website. Default line: "{{CLOSING_A_LINE}}"
  - **B: Follow for tips.** Line: "{{CLOSING_B_LINE}}" The website is not spoken but still shows on screen.
- For option A:
  - Only claim what is true. Before using a claim about a trial, a price or an offer, check the product page again.
  - Vary the line to fit the topic when it helps, but always end on the website.
- On screen (both options): logo, then the website large in the accent colour, held for at least 2 seconds while something still moves. For B, the words "Follow for more tips" sit under the website.

## Numbers the check starts from
- Nothing still for more than **1 second**.
- No more than **2 things moving at once**.

## Factory mode
Reels made by the hub factory choose the closing automatically: **A** when the question is about something the product
offers, **B** (Follow for tips) for general advice and operations. The person can override it per reel. The keyword lists
live in the hub settings (`factory.closingRules`).
