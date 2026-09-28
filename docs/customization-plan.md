# Customizable slides: plan

Hand-made slides, built in an editor, with the AI as a fallback. Built on the
`customization` branch as a **new page** (`/presentation`), so the current
`/presentationv2` keeps working and can keep changing on main while this is
built. Once the new page does everything v2 does, the site switches to it.
`/presentationv2` stays in the code as a backup.

## Slides are canvases

- One slide = a 16:9 canvas, as big as fits in 80% of the screen width and
  height. No inner box. Every slide can look different.
- Elements are placed anywhere. Positions and sizes are **percent of the
  slide** (0–100), so a slide looks the same on a laptop, a projector or a
  phone. Font sizes scale with the slide too.
- Element types: **text** and **image**. (Manim animations are not an element
  for now.)
- Text wraps inside its box. If it still doesn't fit, the font shrinks a
  little (down to a minimum) and the editor warns.
- Text styles are presets: title, body, caption, big number. Each has a color,
  bold and alignment.
- Each slide can have a background color or a background image.

## Audio belongs to elements

- Every element can speak. What is **shown** and what is **spoken** are
  separate fields.
- **Silent switch**: titles, labels and decorative images don't speak.
- Spoken words left blank are written by the AI **when the slide is saved**,
  from the knowledge base, 40–80 words (about 15–30 seconds). An image gets
  spoken words from its description the same way.
- **Queue number** sets the order. Numbered elements go first, in number
  order. Unnumbered ones follow in reading order (top-left to bottom-right).
  Ties go left to right.
- All elements are visible from the start. The one being spoken gets a
  subtle highlight.
- After the last clip on a slide, the deck moves on after **1.5 seconds**.
- Each spoken element has a **plain version** for "simpler please" / "you lost
  me" / a "yes" to the emotion check-in. If left blank, the AI writes it when
  the slide is saved. It plays instead of the current clip only, then the
  slide carries on from there.
- AI-written text shows in the editor marked **AI-written**. Editing it makes
  it yours; clearing it lets the AI write it again.
- Audio is made in the background when a slide is saved, only for elements
  whose words changed. Preview and Publish are then instant.
- How it knows what changed: every AI-made field keeps a fingerprint of what
  it was made from (the box's text, the spoken words, the exact words + voice
  of a clip). Change the source and the AI version is redone on the next save;
  a clip only plays if it says exactly the current words. Clips are stored in
  Supabase `slide-audio/canvas/<fingerprint>.mp3`, so identical words are
  recorded once (lib/canvas/aiFields.ts, lib/canvas/prepare.ts).
- Publish waits for the AI to finish, then writes the recap.

## Commands

| Say / press | Does |
|---|---|
| "next", "next next" | skips the current clip |
| "next slide", "next page", "skip ahead" | next slide |
| "go back", "previous slide" | previous slide |
| "next topic" | first slide of the next topic |
| "repeat", "say that again" | replays the current clip |
| "simpler please", "you lost me" | plain version of the current clip |
| "go to <part>" | finds the slide that talks about it |

## Topics

- The topic is an editor-only field on each slide. Learners don't see it.
- Consecutive slides with the same topic form one topic ("next topic", "go to").
- A blank topic is named by the AI on save.
- The end-of-lesson recap is written by the AI on publish.

## Decks and where they live

There can be **several lessons**. Each lesson has up to three decks:

| Deck | Made by | Used by the presentation |
|---|---|---|
| draft | the editor (Save) | never; only Preview |
| live | the editor (Publish copies draft → live) | first choice |
| AI | gpt-6-luna, when there is no live deck | if there's no live deck |

- The presentation checks for the **live** deck first, then the **AI** deck. If
  neither exists, the AI generates one.
- A hand-made deck is used all-or-nothing. It's never mixed with AI slides.
- Decks are read from **Redis** (fast). Hand-made decks are also written to
  **Supabase** on every save as a backup. If Redis loses one, it's restored
  from Supabase.
- **Start from AI** copies an AI lesson into the draft for editing. It lists
  every AI lesson version cached in Redis (from the very first format to the
  current one), converted to canvas slides from whatever fields that version has.
- Until AI decks are generated in the canvas format (step 5), the "AI deck" for
  the Blue Catfish lesson is the current AI lesson (`/api/slidesv2`) converted
  on the fly. New lessons have no AI fallback until then.
- Backup tables: `supabase/migrations/006_canvas_decks.sql` (lessons, draft/live
  decks, and a history of every publish).

## AI decks

- gpt-6-luna makes whole decks in the canvas format (`lib/canvas/generate.ts`):
  plan 4–6 topics from the knowledge base, then lay out 3–5 slides per topic in
  parallel (positions, styles, spoken words, plain versions), using images
  from the library by their descriptions (ids, never invented URLs).
- The prompt gives the model the same text-fit numbers the checker uses
  (`lib/canvas/fitEstimate.ts`). Each slide is checked: text that won't fit
  even shrunk, boxes off the slide, overlapping text, unknown images. A topic
  with problems goes back to the AI once with the problems listed; what's
  left is auto-fixed (overflowing boxes grow).
- Made from the editor (Start from AI → Make an AI deck), stored in Redis as
  the lesson's `ai` deck. Audio is then made by the save-time AI. Learners get
  it when nothing is published; Preview and Copy into draft are in the same popup.
- Presentation order: live deck → AI deck → (Blue Catfish only) the old AI
  lesson converted.
- In the editor, anything the AI wrote has a faint dashed purple outline and a
  ✨ AI tag; AI-named topics have ✨ in the slide list.

## The editor (`/slideEditor`, computer only)

- Drag and resize boxes on a real-size slide. Type text. Pick a style.
- Slides: add, duplicate, delete, drag to reorder. Undo.
- Lessons: create, switch, delete (with a confirm step; the main lesson can't be deleted).
- Image sidebar: the images already in Supabase, with search. Dragging one onto
  the slide brings its description with it. **Upload** runs a new image through
  the existing image pipeline so it gets a description automatically.
- Fields per element: shown text, spoken words, plain version, queue number,
  silent.
- Warnings: text doesn't fit, box off the slide, boxes overlap, image has no
  description.
- Preview (plays the draft) and Publish.

## Password gate

- `/slideEditor`, `/imageIngest`, `/textIngest`, **and their save/upload APIs**
  ask for a password first.
- Passwords live in Vercel: `EDITOR_PASSWORDS=Kai,Beryl`. The name used is
  remembered on that browser and saved as "last edited by".

## Kept from `/presentationv2`

The new page reuses the shared files directly, so fixes reach both pages:
`useVoiceInput` (barge-in), `interruptBus` (finish the sentence first),
`useEmotionWatcher` (confusion check-in), `signals` (learner tracking) and
`deckCommands` (command parsing). The wiring for those that lives inside
`presentationv2/page.tsx` is re-created on the new page. Each PR lists what was
brought over. Before switching, a final check makes sure the new page does
everything v2 does.

Switched off with flags, not deleted: the old slide types, Manim, variant
slides.

## Steps (one PR each)

1. **Renderer**: the new page, the 16:9 canvas, element audio in queue order
   with highlight, commands, on a sample deck.
2. **Password gate** for the editor pages and their APIs.
3. **Decks + editor**: Redis/Supabase storage, several lessons, the editor,
   image sidebar and upload, Preview and Publish.
4. **Save-time AI**: spoken words, plain versions, topics, recap and audio made
   on save; the fit/overlap checks.
5. **AI decks** in the canvas format (gpt-6-luna).
6. **Bring over v2's features**: barge-in with sentence finish, emotion
   check-in, tutor questions, learner tracking, instructor view.
7. **Switch over**: final comparison with v2, then point the site at `/presentation`.
