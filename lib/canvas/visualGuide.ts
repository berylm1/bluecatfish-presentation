/*
 * How the AI writes the drawn visuals and hands-on boxes (types.ts:
 * ChartElement, DiagramElement, ActivityElement). Shared by the deck maker,
 * the professor's board, and the hands-on drafter, so they all know the same
 * formats.
 */

export const VISUALS_GUIDE = `Drawn visuals (they draw themselves in; keep labels SHORT, under 4 words; never invent numbers):
- Chart: {"type":"chart","kind":"bar"|"line"|"pie","bars":[{"label":"Blue catfish","value":100},{"label":"You","value":90}],"unit":"lbs", x,y,w,h}
  bar = compare amounts (2-6 bars); line = a change over time (label = the year or time, 3-6 points); pie = parts of a whole (2-5 slices). h at least 40.
- Diagram: {"type":"diagram","kind":"steps"|"cycle"|"timeline"|"compare"|"sizes","items":[{"label":"...","detail":"optional, under 8 words","value":0}], x,y,w,h}
  steps = how something happens, in order (2-5 boxes joined by arrows; w at least 60, h at least 30)
  cycle = something that goes round (a life cycle, what eats what in a loop; 3-6 items; a box about as tall as wide, h at least 55)
  timeline = dated events (label = the year, detail = what happened; 2-6 items; w at least 70, h at least 40)
  compare = two sides row by row, add "columns":["Left header","Right header"] (label = left cell, detail = right cell; 2-5 rows)
  sizes = how big things are next to something familiar ("value" sets each circle's size; 2-4 items; h at least 45)`;

export const ACTIVITY_GUIDE = `Hands-on box (the learner DOES something with what the slide teaches; the lesson waits until it's done):
{"type":"activity","kind":"...","prompt":"what to do, under 9 words", x,y,w,h, "say": "20-40 words starting with 'Your turn': why, and exactly what to do (never the answers)"}
- sort: "groups":["Native","Invader"], "items":[{"text":"Blue crab","group":0},{"text":"Blue catfish","group":1}]  (2-4 groups, 3-8 items; group = index)
- order: "items":[{"text":"first step"},{"text":"second step"}, ...]  (3-6 steps in the RIGHT order; they're shuffled for the learner)
- cards: "items":[{"text":"Guess: how heavy?","back":"Over 100 pounds!"}, ...]  (2-6 cards: a question or guess on the front, the answer on the back)
- hotspots: "image":"img2", "items":[{"text":"Whiskers","back":"They taste the water","x":12,"y":60}, ...]  (a picture from AVAILABLE IMAGES; 2-5 spots, x/y = % of the picture)
- slider: "slider":{"label":"Age","unit":"years","min":0,"max":20,"stops":[{"at":0,"text":"Hand-sized","scale":0.4},{"at":10,"text":"As long as your arm","scale":1}]}, optional "image" that grows with "scale" (2-6 stops)
Make it about THIS slide's facts, short words, and big: w at least 70, h at least 55. Only ONE hands-on box on a slide.`;
