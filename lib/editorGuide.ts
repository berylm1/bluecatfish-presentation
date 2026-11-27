// What the slide editor can do and where each thing is: the ✨ helper (/api/editor/assistant)
// answers "where is…", "can I…", "how do I…" from this, and nothing else. `show` names the
// part of the page it can point at (a [data-help="…"] element in app/slideEditor/page.tsx).
// Keep it in step with the editor when a feature moves or is added.

export type GuideEntry = { show?: string; what: string };

export const SHOWABLE = [
  'lesson', 'ai-status', 'save', 'preview', 'publish', 'live', 'undo', 'add-text', 'add-image', 'add-chart', 'hands-on', 'rewrite',
  'lesson-settings', 'more', 'slide-list', 'new-slide', 'overview', 'layers', 'canvas', 'tab-edit', 'tab-images', 'tab-check', 'tab-repeats', 'tab-ideas', 'helper',
] as const;
export type Showable = (typeof SHOWABLE)[number];

export const EDITOR_GUIDE: GuideEntry[] = [
  // the one dark bar at the top
  { show: 'lesson', what: 'Lesson picker (top left of the dark bar): switch lesson, or "+ New lesson…" to make one. The new-lesson steps take a topic, your own material (pasted, or a PDF or Word file), who it is for, the teacher\'s name and voice, then an outline to edit before the AI writes the slides.' },
  { show: 'ai-status', what: 'The AI status chip next to it ("N to write or record", "Words and audio ready"): click it to see what is left (spoken words, simpler versions, voice clips, helper slides, class questions, the quiz, captions, laser marks, answer checks) and "AI use so far" for this lesson, an estimate in dollars. The AI does these when you press Save.' },
  { show: 'helper', what: 'The helper box (middle of the top bar): ask where something is or if the editor can do something, find a picture from the image library and put it on the slide, or find a sentence from the knowledge base and put it in a text box.' },
  { show: 'undo', what: 'Undo / Redo (arrows in the top bar, Ctrl+Z / Ctrl+Shift+Z): everything can be undone until you save, including AI rewrites.' },
  { show: 'save', what: 'Save (or Ctrl+S): saves the draft and starts the AI fill-in and the audio. Autosave also keeps your changes about 20 seconds after you stop editing (turn it off in the ⋯ menu); autosave does not start the AI.' },
  { show: 'preview', what: 'Preview: play the saved lesson in a new tab, from the start or from the slide you are on.' },
  { show: 'publish', what: 'Publish (the coloured button): shows a checklist first, then asks for a name to save the version as. Learners then get this version.' },
  { show: 'lesson-settings', what: 'Lesson settings (gear, top right): what the lesson is about, ages, goals, where facts come from, the teacher\'s name, picture and voice, math on the slides, the family card, the sources.' },
  { show: 'more', what: 'The ⋯ menu (top right): Share with learners… (the link and a QR code), How learners did (results on each slide, wrong answers, time per slide, download as a spreadsheet), Download as a PDF… (teacher script, handout, narration, or a worksheet to print with an answer key), Saved versions…, Start from AI…, Duplicate this lesson…, Translate a copy… (another language), Autosave on/off, links to Lesson review, adding source text, the studies and the backup, Lock the editor, and Delete this lesson….' },
  // left
  { show: 'slide-list', what: 'Slide list (left): click a slide to edit it, drag slides to reorder them. Grouped by topic (click a topic to fold it), with each topic\'s length; "split?" on a long topic suggests where to split it. Page Up / Page Down move between slides. The panel folds away with the button at the left end of the slide\'s toolbar.' },
  { show: 'new-slide', what: 'New, duplicate (two squares) and delete (bin) above the slide list: add a slide after this one, copy it, or delete it.' },
  { show: 'overview', what: 'The grid button above the slide list: every slide at once, to drag into a new order or click to open.' },
  // middle
  { show: 'add-text', what: 'Text (slide toolbar): adds a text box. Double-click a text box on the slide to edit its words.' },
  { show: 'add-image', what: 'Picture (slide toolbar): opens the Pictures tab to add one (or drag one onto the slide).' },
  { show: 'add-chart', what: 'Chart (slide toolbar): bar, line or pie chart; steps, cycle, timeline, compare, sizes; and for math: number line, fraction bars, graph, worked example, area model, clock faces, coins and notes, shapes and angles, table.' },
  { show: 'hands-on', what: 'Hands-on (slide toolbar): "Hands-on slide from this slide" (the AI makes one), or add an example to edit: sort into groups, put in order, guess and flip cards, explore a picture, slider, type the answer, fill in the blank, match the pairs.' },
  { show: 'rewrite', what: 'Rewrite (purple, slide toolbar): the AI writes this slide again the way you ask: make it simpler, add an example, shorten the words, make it more visual, turn it into a question, or your own instruction. Ctrl+Z puts the old slide back.' },
  { show: 'layers', what: 'Main / Helper above the slide: the helper is the "another way to see it" version the slide turns into when a learner is lost. Edit it like any slide.' },
  { show: 'canvas', what: 'The slide: click a box to select it, drag to move, pull corners to resize, arrow keys nudge (Shift = more). The selected box has its own small dark toolbar: duplicate, bring forward, send backward, delete. Tags: "AI" = words the AI wrote, "silent" = not spoken, "Check answers" on hands-on boxes, "No description" on pictures that need one.' },
  { show: 'live', what: 'The strip under the slide: which named version learners see now and whether your draft has changes since ("take down" removes the live lesson), and "Keys and marks" for the shortcuts.' },
  // right panel
  { show: 'tab-edit', what: 'Right panel, Edit tab: the selected box\'s settings in folding sections (what it shows, what the professor says, speaking order and laser pointer, size and position); for pictures: description, caption, credit, fit, and "Zoom in on a part" (crop); with nothing selected: the slide\'s topic and background, class questions, the recap and the quiz. The panel folds away with the button at the right end of the slide\'s toolbar.' },
  { show: 'tab-images', what: 'Right panel, Pictures tab: "Find a picture for this slide" (the AI adds one that fits), this lesson\'s pictures (search, click or drag onto the slide), Find free (Wikimedia Commons and Openverse, photos or drawings, added with their credit), and Upload.' },
  { show: 'tab-check', what: 'Right panel, Review tab: one list of what to look at before publishing (layout warnings, pictures without a description, hands-on answers, facts, story order, repeats, long dashes, words and audio), then three parts: Facts and pictures (check facts against the knowledge base, describe pictures, story order, pictures to add), Repeats, and Idea map.' },
  { show: 'tab-repeats', what: 'Review tab → Repeats: finds the same thing said twice across topics and suggests rewrites (Use this / Skip).' },
  { show: 'tab-ideas', what: 'Review tab → Idea map: the ideas the slides teach and which build on which.' },
  // what learners get (for "is there a … in the lesson")
  { what: 'In the lesson (for learners): the professor talks each slide, with a laser pointer, captions and a transcript; buttons for back, pause, next, simpler words, another way, talk (mic) and typing a question; Options: voice speed, interrupt by talking, camera, classmates, sounds, class chat, and (in lessons made with the builder) Larger text and High contrast. Type-the-answer boxes give a hint after a wrong try, have math keys, and offer "Practise with new numbers" when done.' },
  { what: 'Not in the editor (say so if asked): editing audio by hand, collaborating live in the same lesson at once, separate accounts for each editor, or anything not listed here.' },
];

export const guideText = () => EDITOR_GUIDE.map((g) => `- ${g.what}${g.show ? ` [show: ${g.show}]` : ''}`).join('\n');
