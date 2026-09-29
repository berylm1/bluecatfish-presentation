# `/presentation` vs `/presentationv2`

Checked feature by feature before switching the site to the canvas page. ✅ = on
the new page, ➖ = switched off on the old page too, 🔁 = done differently.

| Feature on `/presentationv2` | `/presentation` | Notes |
|---|---|---|
| Lesson content: AI sections from `/api/slidesv2` | ✅ | Published deck → AI deck → the old lesson converted |
| Pre-made narration audio | ✅ | Recorded on save (step 4); otherwise spoken live |
| Bullets on screen, longer narration spoken | ✅ | Every element has shown text and separate spoken words |
| Highlighted text while speaking | 🔁 | The spoken element glows; the transcript highlights the sentence |
| Intro line | ✅ | Short, lesson-agnostic ("Let's dive in") |
| Topics run in order, auto-advance | ✅ | 1.5s after a slide's last clip |
| Topic picker (hub) | ➖ | Commented out on v2 |
| "Skip ahead", "go back", "next topic", "repeat", "go to <part>" | ✅ | Plus "next" = skip one clip |
| Spoken command replies ("Skipping ahead.") | ✅ | `/api/cues` |
| Semantic "go to" fallback (`/api/deck/search`) | ✅ | |
| "Simpler please" (plain version) | 🔁 | Plain version of the current clip only, not the whole slide |
| "You lost me" → variant slide / remediation | 🔁 | Variant slide matched by topic + slide words; else the plain version (no separate remediation text) |
| Partner's PDF deck variants with images (migration 005) | ✅ | Same `slide_templates` rows, image shown |
| Questions to the tutor, spoken answers | ✅ | Last exchange shown under the slide (no scrolling chat history) |
| Tutor decision header (simplify / advance / repeat) | ✅ | |
| Tutor knows the learner's state | ✅ | `describeForTutor` |
| Barge-in | 🔁 | Own listener: pre-roll, echo cancelled, adaptive levels; finishes the sentence, not the whole clip |
| Mic meter | ✅ | |
| Emotion check-in (camera) | ✅ | "yes" → another way to see it (confused) / next slide (bored) |
| Hand raise (camera) | ✅ | |
| Presence: pause when away, resume when back | ✅ | |
| Self-check after each topic | ✅ | By click or voice; "Lost me" → another way to see it |
| Conclusion: intro line, recap, outro | ✅ | One lesson recap instead of per-topic recap clips |
| Learner events + learner_state | ✅ | Same tables; section = topic, step = slide in the topic |
| Instructor view | ✅ | Reads the same tables |
| Sources link | ✅ | Footer |
| Quiz, review of missed questions | ➖ | `QUIZ_ENABLED = false` on v2 |
| True/false, guess, side by side, "your turn", stats | ➖ | Off on v2 (flags in `/api/slidesv2`) |
| Manim animations | ➖ | Off by request; could come back as an editor element |
| Key terms | ➖ | Commented out on v2 |
| Dev mode | — | Not brought over (the editor and `/lessonReview` cover checking content) |

New on `/presentation` only: the slide editor and hand-made decks, several
lessons, AI decks in the canvas format, the transcript overlay, "next" for one
clip, the I'm lost button, `/lessonReview` for canvas decks.
