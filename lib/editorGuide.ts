// What the slide editor can do and where each thing is: the ✨ helper (/api/editor/assistant)
// answers "where is…", "can I…", "how do I…" from this, and nothing else. `show` names the
// part of the page it can point at (a [data-help="…"] element in app/slideEditor/page.tsx).
// Keep it in step with the editor when a feature moves or is added.

export type GuideEntry = { show?: string; what: string };

export const SHOWABLE = [
  'lesson', 'ai-status', 'save', 'preview', 'publish', 'live', 'undo', 'add-text', 'add-image', 'add-chart', 'hands-on',
  'learners', 'pdf', 'more', 'slide-list', 'new-slide', 'layers', 'canvas', 'tab-edit', 'tab-images', 'tab-repeats', 'tab-check',
  'describe-all', 'helper',
] as const;
export type Showable = (typeof SHOWABLE)[number];

export const EDITOR_GUIDE: GuideEntry[] = [
  // the dark bar at the very top
  { what: 'Top dark bar: links to Slide editor, Lesson review (a readable page of the lesson, to print), Image upload (add pictures to the image library) and Text upload (add sources to the knowledge base the AI uses), and Lock (lock the editor again).' },
  // row 1
  { show: 'lesson', what: 'Lesson picker (top left): switch lesson, or "+ New lesson…" to make one.' },
  { show: 'ai-status', what: 'The AI status chip next to it ("N to write/record", "✓ Words & audio ready"): when you save, the AI fills in spoken words, plain versions, topic names, topic introductions, picture captions, helper slides, laser marks, the quiz, hands-on answer checks, the story-order check and all the audio. Hover it to see problems.' },
  { show: 'helper', what: 'The ✨ helper box (top middle): ask where something is or if the editor can do something, find a picture from the image library and put it on the slide, or find a sentence from the knowledge base and put it in a text box.' },
  { show: 'live', what: 'Live status (top right): which named version learners get now, or "Not published"; "take down" removes the live lesson (learners get the AI lesson again).' },
  { show: 'save', what: 'Save (or Ctrl+S): saves the draft. Saving starts the AI fill-in and the audio.' },
  { show: 'preview', what: 'Preview ▾: play the saved lesson in a new tab, from the start or from the slide you are on.' },
  { show: 'publish', what: 'Publish: shows a checklist first (warnings, facts not checked, repeats, hands-on answers, story-order moves, pictures without a description), then asks for a name to save the version as (a name not used before). Learners then get this version.' },
  // row 2
  { show: 'undo', what: 'Undo / Redo buttons (Ctrl+Z / Ctrl+Shift+Z): everything in the editor can be undone until you save, including AI suggestions you used.' },
  { show: 'add-text', what: '＋ Text: adds a text box. Double-click a text box on the slide to edit its words.' },
  { show: 'add-image', what: '＋ Image: adds a picture (or drag one from the Images tab onto the slide).' },
  { show: 'add-chart', what: '＋ Chart or diagram ▾: bar chart, line chart, pie chart, steps (arrows), cycle, timeline, compare (two columns) and sizes (circles).' },
  { show: 'hands-on', what: '🖐 Hands-on ▾: "✨ Hands-on slide from this slide" (the AI makes one from what the slide teaches), or add an example to edit: sort into groups, put in order, guess & flip cards, explore a picture (spots), or a slider.' },
  { show: 'learners', what: '📊 Learners: how each slide went for learners in the last 30 days (puzzled faces, "I\'m lost", skips…), as badges on the slide list, details under the slide, and a list of the hands-on boxes learners skip or need help with most.' },
  { show: 'pdf', what: '⬇ PDF ▾: download the lesson as a PDF: Teacher script (each slide with what the professor says), Handout (slides only, two per page) or Narration only (just the words); options for helper slides and a sources page.' },
  { show: 'more', what: 'More ▾: Saved versions… (every published version by name: copy one slide back into the draft, or replace the draft with a whole version), Start from AI… (make an AI slideshow, or copy the AI one into the draft; "Finish the audio" if its audio was cut short), Lesson review, Delete this lesson…, and ✨ Describe all pictures.' },
  // left
  { show: 'slide-list', what: 'Slide list (left): click a slide to edit it, drag slides to reorder them. Grouped by topic, with each topic\'s length; "split?" on a long topic suggests where to split it. Page Up / Page Down move between slides.' },
  { show: 'new-slide', what: '+ New, Duplicate, Delete (above the slide list): add a slide after this one, copy it, or delete it.' },
  // middle
  { show: 'layers', what: 'Main slide / Helper (when lost) tabs above the slide: the helper is the "another way to see it" version the slide turns into when a learner is lost. Edit it like any slide.' },
  { show: 'canvas', what: 'The slide: click a box to select it, drag to move, pull corners to resize, arrow keys nudge (Shift = more), Delete removes it. Tags: "✨ AI" = words the AI wrote, "silent" = not spoken, "⚠ Check answers" / "✓ AI fixed answers" on hands-on boxes, "🖼 No description" on pictures that need one.' },
  // right panel
  { show: 'tab-edit', what: 'Right panel, ✏️ Edit tab: the selected box\'s settings (words, style, color, spoken words, plain version, queue number, position; for pictures: description with ✨ Describe it, caption, fit, laser pointer marks; for hands-on boxes: kind, instruction, groups/items/cards/spots/stops and the answer check). With nothing selected: the slide\'s topic, topic introduction and background, and the lesson\'s end-of-lesson recap and quiz (on/off, see and remove questions).' },
  { show: 'tab-images', what: 'Right panel, 🖼 Images tab: search the image library, upload a picture, drag one onto the slide, or use one as the slide background.' },
  { show: 'tab-repeats', what: 'Right panel, 🔁 Repeats tab: finds the same thing said twice across topics and suggests rewrites (Use this / Skip).' },
  { show: 'tab-check', what: 'Right panel, 🔎 Check tab: check this slide\'s facts (or every slide) against the knowledge base with sources; mark facts fine or use a fix; 📖 Story order suggestions (Move / Skip / Use them all); gaps in the knowledge base; pictures without a description with ✨ Describe all.' },
  { show: 'describe-all', what: '✨ Describe all pictures: the AI writes a description for every picture that has none (the chip in the top row when some are missing, More ▾, or the Check tab). For one picture: select it and press ✨ Describe it under its Description.' },
  // what learners get (for "is there a … in the lesson")
  { what: 'In the lesson (for learners): the professor talks each slide, with a laser pointer, captions and a transcript; buttons for previous/next slide, pause, skip ahead, repeat, simpler please, I\'m lost, talk (mic) and typing a question; Options: voice speed (0.85×/1×/1.15×), interrupt by talking, camera (hand raise, puzzled face), Finn the AI classmate, sounds, transcript. Finn makes mistakes to catch; a self-check after each topic; an end-of-lesson quiz (3 questions); an end screen with achievements.' },
  { what: 'Not in the editor (say so if asked): editing audio by hand, changing the professor\'s voice, other languages, collaborating live in the same lesson at once, sharing outside the site, or anything not listed here.' },
];

export const guideText = () => EDITOR_GUIDE.map((g) => `- ${g.what}${g.show ? ` [show: ${g.show}]` : ''}`).join('\n');
