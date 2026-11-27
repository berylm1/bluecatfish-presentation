/*
 * How the AI writes the drawn visuals and hands-on boxes (types.ts:
 * ChartElement, DiagramElement, ActivityElement). Shared by the deck maker,
 * the professor's board, and the hands-on drafter, so they all know the same
 * formats.
 */

export const VISUALS_GUIDE = `Drawn visuals (they draw themselves in; keep labels SHORT, under 4 words; never invent numbers; a visual shows what its own slide is about, nothing else):
- Chart: {"type":"chart","kind":"bar"|"line"|"pie","bars":[{"label":"Blue catfish","value":100},{"label":"You","value":90}],"unit":"lbs", x,y,w,h}
  bar = compare amounts (2-6 bars); line = a change over time (label = the year or time, 3-6 points); pie = parts of a whole (2-5 slices). h at least 40.
- Diagram: {"type":"diagram","kind":"steps"|"cycle"|"timeline"|"compare"|"sizes","items":[{"label":"...","detail":"optional, under 8 words","value":0}], x,y,w,h}
  steps = how something happens, in order (2-5 boxes joined by arrows; w at least 60, h at least 30)
  cycle = something that goes round (a life cycle, what eats what in a loop; 3-6 items; a box about as tall as wide, h at least 55)
  timeline = dated events (label = the year, detail = what happened; 2-6 items; w at least 70, h at least 40)
  compare = two sides row by row, add "columns":["Left header","Right header"] (label = left cell, detail = right cell; 2-5 rows)
  sizes = how big things are next to something familiar ("value" sets each circle's size; 2-4 items; h at least 45){{mathVisuals}}`;

/** For a lesson that uses math ({{mathVisuals}}, lib/canvas/profile.ts): the math kinds of diagram */
export const MATH_VISUALS_GUIDE = `
  More kinds of diagram, for math (write a fraction as 3/4: it is shown stacked, as on a board):
  numberline = numbers or fractions as points on a line: "from":0,"to":1,"parts":4 (the equal parts marked in each whole), items = the points {"label":"3/4","value":0.75} (1-5 points; w at least 70, h at least 35)
  fraction = fraction bars: each item's "label" is a fraction ("3/4" draws a bar cut into 4 with 3 shaded), "detail" = a short note; 1-4 bars, one under another, to compare fractions or show equal ones (w at least 60, h at least 14 per bar)
  graph = points on x and y axes: items = the points {"x":2,"value":5,"label":"optional"}, "columns":["x axis name","y axis name"], "connect":true joins them with a line (2-8 points; h at least 50). To compare TWO lines on one graph, give every point "line":"its line's name" (2-6 points each)
  worked = a worked example, one line of working per item, in order: "label" = the line ("1/2 + 1/3 = 3/6 + 2/6"), "detail" = why, under 8 words; 2-5 lines, the last is the answer. It is shown one line at a time while its "say" walks through the lines in the same order, about as many words for each (w at least 70, h at least 14 per line)
  area = an array or area model for multiplying: "from":3 (rows), "to":4 (columns), optional "parts":6 (how many squares are shaded; left out: all), items = [{"label":"3 × 4 = 12"}] written under it (rows and columns up to 12; w at least 40, h at least 50)
  clock = clock faces for telling the time: each item {"label":"3:45","detail":"quarter to four"}; 1-3 clocks side by side (h at least 45)
  money = coins and notes to count: each item {"label":"25¢","value":3,"detail":"3 quarters"} (label = what is printed on it, value = how many, up to 10); "unit" = the total written under them ("85¢"); 1-4 kinds
  shape = flat shapes and angles: each item {"label":"triangle","detail":"3 sides"}; names it can draw: triangle, right triangle, square, rectangle, pentagon, hexagon, octagon, circle; an angle is {"label":"angle","value":60,"detail":"acute"} (value = its degrees); 1-4 side by side (h at least 45)
  table = a small table: each item is one row, {"label":"cell | cell | cell"}; the first row is the header; 2-6 rows, 2-4 columns, short cells (w at least 50, h at least 9 per row)
  For a calculation with steps use worked, not steps; for fractions as amounts use fraction or numberline.
  A graph ONLY when the slide itself is about two amounts that change together (hours and miles, cups and servings), with both named on its axes: never beside something it has nothing to do with.`;

export const ACTIVITY_GUIDE = `Hands-on box (the learner DOES something with what the slide teaches; the lesson waits until it's done):
{"type":"activity","kind":"...","prompt":"what to do, under 9 words", x,y,w,h, "say": "20-40 words starting with 'Your turn': why, and exactly what to do (never the answers)"}
- sort: "groups":["Native","Invader"], "items":[{"text":"Blue crab","group":0},{"text":"Blue catfish","group":1}]  (2-4 groups, 3-8 items; group = index)
- order: "items":[{"text":"first step"},{"text":"second step"}, ...]  (3-6 steps in the RIGHT order; they're shuffled for the learner)
- cards: "items":[{"text":"Guess: how heavy?","back":"Over 100 pounds!"}, ...]  (2-6 cards: a question or guess on the front, under 70 characters, the answer on the back)
- hotspots: "image":"img2", "items":[{"text":"Whiskers","back":"They taste the water","x":12,"y":60}, ...]  (a picture from AVAILABLE IMAGES; 2-5 spots, x/y = % of the picture)
- slider: "slider":{"label":"Age","unit":"years","min":0,"max":20,"stops":[{"at":0,"text":"Hand-sized","scale":0.4},{"at":10,"text":"As long as your arm","scale":1}]}, optional "image" that grows with "scale" (2-6 stops)
- answer: "items":[{"text":"What is 1/4 + 2/4?","back":"3/4 | three quarters"}, ...]  (1-5 questions the learner TYPES the answer to: a problem to work out, a number or key word to recall; "back" = the answer, other wordings that count after "|"; numbers are compared by value, so 3/4 = 0.75 = 6/8 already. Best for math, spelling and short facts. The answer must be SHORT and easy to type exactly: a number, a fraction or 1-3 words, never a sentence; a "why" or "explain" question belongs on a card instead)
- blank: "items":[{"text":"The cat ___ on the mat.","back":"sat | sits"}, ...], optional "groups":["ran","flew"]  (1-5 sentences, each with ONE missing word marked ___ ; "back" = the word, others that count after "|". "groups" = extra wrong words: with it the learner taps a word from a word bank instead of typing; leave it out for spelling. Best for vocabulary, grammar and language lessons)
- match: "items":[{"text":"perro","back":"dog"},{"text":"gato","back":"cat"}, ...]  (3-6 pairs that go together: a word and its meaning, a word in two languages, a term and its example; every "back" different, each under 5 words. The left side is all ONE kind of thing and the right side all the other: never the same pair again the other way round)
Make it about THIS slide's facts, short words, and big: w at least 70, h at least 55. Only ONE hands-on box on a slide.`;
