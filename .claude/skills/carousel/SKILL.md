---
name: carousel
description: Make a finished Instagram carousel (1080 x 1350, 4:5) from a topic, in two styles, 2D (Remotion only) or 3D (a Blender scene cut into slides). Use when the person types /carousel or asks for a carousel, slides to swipe or a swipe post.
---

# Make a carousel

A topic in, a finished carousel out: slides as PNG, a caption, a plan. Work in `<brand folder>/carousels/<n>-<short-name>/` (the hub gives you the folder and the brand folder in the prompt of a job).
Read `<brand folder>/identity/brand.json` and `<brand folder>/identity/style.md` first, every time: colours, fonts, tone, closing lines, offer, language.
The person chose the **style** (2D or 3D), the **number of slides** (4 to 8) and the **closing** (A: the brand's offer, B: follow for tips). Do not ask again.

The slides are the product. People swipe when each slide gives a reason to go on, so the work is: a hook, a clear story across the slides, one real thing to look at on each slide,
and a finish that is built well enough to be worth posting. Pictures first, few words.

## 1. Find the structure and write the words (two Ootto skills, both required)

Make a real Skill tool call to each, in this order, and use what they give. The hub checks that both were called.

1. **`ootto-viral-carousel`: which structure to use.** Its method: look at what carousels in the niche people actually save, name the *job of every slide* (hook, payoff, proof, step, summary, ask), and keep that structure without
   copying any slide. Use it in factory mode like this: read-only, no cookies, no logins. If the Instagram connector or account list it asks for is not available, study the niche through public pages
   (`ootto-agent-reach`, WebSearch) and the brand's own past carousels and analytics; if you cannot find a proven structure, say so in plan.md and use the standard shape below. Numbers come from a source or the brand, never from a guess.
   Copy the structure, never the slides, the words or the design.
2. **`ootto-carousel-builder`: the words of every slide.** One idea per slide; slide 1 is the scroll stopper (a claim, a number or a contrast, under 8 words); the second-to-last slide is the one people save (a summary or a checklist);
   the last slide is the single ask. If a slide needs three lines to make sense, it is two slides. Write in the brand's language and tone. Use it for the copy only: the pictures are made here, in step 3 or 4.

The standard shape when nothing better is found: **1 hook, 2 the problem, 3 to N-2 one step or reason each with something real to look at, N-1 the summary, N the ask.**

## 2. The plan (`plan.md`, first)

A short brief: what the carousel is about in one sentence; who it is for and what they get; the hook; the structure (the job of each slide) and where it came from; per slide: its words, what it shows and **whether that picture is real or drawn**;
the one thing to do at the end. Keep it to a page. The plan is pre-approved in the factory: go on without waiting.

## 3. What every slide looks like (both styles)

- **1080 x 1350, 4:5.** Margins of 70 px. Nothing that must be read within 120 px of the top or 100 px of the bottom except the frame (below).
- **One frame on every slide:** the brand name small at the top left, "01 / 05" at the top right, a step label above the title ("STEP 1") on the steps, progress dots and "Save for later" at the bottom ("Swipe →" on the first slide). Same places on every slide.
- **Type:** the headline in the brand's headline font, big (110 to 150 px for a title of two to four words), uppercase, with **one word in the accent colour in a serif italic** for a human touch. A sentence below it in the body font, 40 px, two lines at most.
  Under the sentence, small finished **tags** (46 px high: a dot, a label, a thin border, a soft shadow) for facts such as a changed price, languages, a table number. Tags are 2D elements under the text, never labels stuck in the picture.
- **Words:** not too few, not too many: the headline, one sentence, a few tags. Every slide reads in two seconds on a phone. Contrast is high: ink on light, white on dark; never light grey for text that must be read.
- **Show the real thing.** When the brand has a product folder (the prompt gives it), put its real screens in the slides: crop each screenshot to the part that matters and show it in a drawn tablet or phone (aluminium or titanium edge, bezel, camera, island, side buttons, a faint glass reflection).
  Add a small notification-style card (a "toast") over the corner when it shows something that just happened ("Price updated"). Use only what exists in the product: never invent a screen, a feature or a number.
  When there is no product, show the idea as drawn objects with the brand's own copy.
- **Depth without clutter:** one hero in front (the biggest thing, lower two thirds), at most two supporting things behind it, soft layered shadows (three shadows: tight, medium, wide), nothing floating without a shadow.
- **Colour:** the brand's colours drive it; the background is a soft colourful gradient with blurred colour clouds that **continue across the slides** (position the clouds by the slide's index) plus a very fine grain on top. Alternate light and dark slides if it helps the rhythm, never more than two of the same in a row.
- **The offer slide.** With closing A, the last slide shows the brand's offer exactly as `style.md` / `brand.json` say: what it gives, the codes (one pill each), who it is for, and the **valid-until date**; check the date against today before using it and drop the offer if it has ended.
  The logo is the brand's own `logo.png` as it is, with slightly rounded corners and a soft shadow: never put a coloured box behind it, never recolour it. With closing B, a follow call and the website.
- **The first slide is also the cover in the grid:** its title is readable alone, at thumbnail size.

## 4. The 2D style (Remotion only, no Blender)

- Code in `<carousel folder>/code/`: `index.ts` (`registerRoot`), `Root.tsx` (one composition `Slide`, 1080 x 1350, 1 frame, props `{n: number}` for the 0-based slide), `Slide.tsx`, the shared pieces (`Frame`, `Tablet`, `Phone`, `Sheet`, `Toast`, `Tag`, `Background`). Import the kit by alias (`@kit/theme`: `C` colours, `headline`, `body` fonts).
- Images: copy the ones you need into `<carousel folder>/assets/` and turn them into a module with `node scripts/carousel/embed-assets.mjs <assets folder> <carousel folder>/code/assets.ts` (data URIs; no public/ folder). Crop screenshots first with ffmpeg (`-vf crop=w:h:x:y`).
- **Texture is real, not shader noise.** Paper uses a real paper image multiplied over the sheet (generate it with `blender-run -b -P scripts/carousel/blender/textures.py -- <folder> paper`, which also makes wood, cloth and a grain height map; or use any real texture you have).
  Do not use SVG turbulence filters for paper: they produce coloured interference. A fine film grain over the whole background is fine.
- Devices and sheets are drawn in code with layered gradients and box shadows. A sheet of paper has a slight rotation, a rounded corner and three shadows.
- Render every slide: `bash scripts/slot.sh render 3 -- scripts/carousel/render-slides.sh <carousel folder>/code/index.ts Slide <carousel folder> <slides>` (writes `slide-1.png` ... in the carousel folder).

## 5. The 3D style (a Blender scene cut into slides, then text over it in Remotion)

One scene as wide as all the slides together, rendered once, so objects cross the edge between two slides and the scene continues when the person swipes. The method:

1. **Textures first.** `blender-run -b -P scripts/carousel/blender/textures.py -- <carousel folder>/tex` makes `wood.png`, `paper.png`, `cloth.png` and the height maps. Put the product screens you will use in the same folder, cropped to the shape of the face they go on (a tablet screen is about 1.42:1, a phone 0.47:1).
2. **Objects.** Use the kit: `scripts/carousel/blender/kit.py` (phone, tablet, QR stand, cloche, glass, cup and spoon, cutlery, pepper mill, napkin, plate, bottle, menu card, tile, pen, cross, a wood table). Read the module doc and the function docs.
   Build what the topic needs with the same care: lathe for round things, one outline extruded for flat things, curves with a bevel for handles, real materials. **Never overlap two bars in one plane, never leave a part floating, never use food, fruit or vegetables** unless you have a very well defined texture for them (they look like plastic otherwise). Prefer wood, steel, glass, ceramic, paper, cloth, leather.
3. **Check every object before you use it, with numbers and with eyes.** `CAROUSEL_TEX=<tex> CAROUSEL_OUT=<out> blender-run -b -P scripts/carousel/blender/check.py -- <object>` writes a 2 x 2 grid (front, three-quarter, back, top) and prints size, lowest point and WARN lines; add `detail` for four close-ups.
   Look at the images with the Read tool. Fix what shows: floating parts, a dirty centre where two pieces overlap, screens squeezed, textures too fine to see. Look at a crop of the final render at 100% too: a texture that is flat there is too fine.
4. **The scene.** Write `scene.py` in the carousel folder: `import kit`, clear, the table (`kit.wood()` on a plane, scaled to cover the width), the objects placed by slide (`X = [(i - (N-1)/2) * 3.2 for i in range(N)]`; one **hero** per slide in front, two or three supporting objects behind at other depths), a key light, a rim light and a fill per slide,
   the camera (`kit.camera`, a long lens, about 13 degrees up, depth of field with `fstop` around 3.6, the focus on the heroes), `kit.render_setup(200, 1080 * N, 1350, transparent=True)`, Standard view transform, render to `panorama.png`. Keep the top 45 percent of the picture free of objects: the text goes there. Preview with 24 samples at a quarter size first.
5. **Cut and compose.** `scripts/carousel/slice-panorama.sh panorama.png slices N` writes `slice-1.png` ... Then build the slides in Remotion exactly like the 2D style (frame, title, sentence, tags, the soft background), with the slice as an image over the background and the text on top. Embed the slices with `embed-assets.mjs`.
6. **Render with the GPU** through `bash scripts/slot.sh blender 1 -- blender-run -b -P scene.py` (one Blender at a time); the final render takes about a minute.

## 6. Check your own work

- **At 100%.** Cut a crop of every slide at its real size and look at it: text readable on a phone, nothing cut off, colliding or inside another element, no coloured interference on paper, textures visible but not dirty, screenshots sharp and cropped to what matters.
- **Swipe test.** Put the slides side by side in one strip: the background and the scene continue from one to the next, the frame sits in the same place, the rhythm alternates.
- **Story test.** Read only the titles in order: they tell the story. Slide 1 stops the scroll alone, the second-to-last is worth saving, the last asks for one thing.
- **Truth test.** Every number, price, code, date and screen is real and comes from the brand, the product or a source. Say in the hand-over what is real and what is drawn.
- Fix what fails and render again, three rounds at most.

## 7. Caption, files, hand over

- `caption.md` follows the reel caption pattern (see step 11 of the `reel` skill): the opening hook with 👇, one short line per slide idea (📌 for facts, 1️⃣ 2️⃣ 3️⃣ for steps), the closing block (A: the 🎁 offer line with the codes and the valid-until date, then the brand's call-to-action; B: the follow line),
  one save-and-share line that ends with 📌, 10 to 11 hashtags on one line with a plain `#`. Same language as the carousel. Say nothing the slides do not support.
- Files in the carousel folder: `slide-1.png` ... `slide-N.png` (the final slides, 1080 x 1350), `plan.md`, `caption.md`, `carousel.json` (`{"style":"2d"|"3d","topic":"...","title":"..."}`), `alt.json` (an array with one alt text per slide, in order: at most 100 characters each, what the image really shows in the words a person would search for, no hashtags or keyword lists), `code/` (the Remotion code), `assets/` or `tex/` (what you used).
- Give the folder, the caption and one thing you would improve. Never post and never schedule: that is for the person.

The rules for props, textures and Blender accuracy are the same ones as in the `reel` skill ("Props and 3D with Blender") and the rules for a good hook and for readable text are those of "Make it land" in that skill.
