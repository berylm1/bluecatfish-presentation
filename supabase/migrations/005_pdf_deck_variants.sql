-- ====================================================================
-- Migration 005: PDF deck as the confusion/variant visuals
-- Beryl's authored deck (BlueCatfish Simple Presentation) becomes the
-- knowledge base's visual layer: when the learner is confused, the
-- instructor shows the matching authored slide and explains it live.
-- Idempotent. Requires 002 (slide_templates) applied first.
-- ====================================================================

alter table public.slide_templates add column if not exists image_url text;

-- One authored slide per deck topic, variant 'visual' (first choice for
-- confused learners). `concept` carries the topic words the variant
-- matcher (sameTopic) uses against the planner's section title, so the
-- mapping survives regeneration of the lesson plan.
insert into public.slide_templates (concept, section, variant, target_state, title, body, narration, image_url, sort_order)
values
  ('What Is The Blue Catfish', 0, 'visual', 'confused',
   'Meet the blue catfish',
   'Large, smooth-skinned, slate blue body, whisker-like barbels. Ictalurus furcatus. Under 2 ft usually — up to 5 ft and 100+ lbs. Lifespan 9-10 years.',
   'Here is my own slide on this. Look at the animal itself: a large, smooth-skinned fish with that slate blue body, and those four pairs of whisker-like barbels around its mouth — which can actually taste the water. Scientifically, Ictalurus furcatus. Usually under two feet, but it can hit five feet and a hundred pounds.',
   '/deck/slide02.jpg', 0),

  ('Fun Facts About Blue Catfish', 0, 'visual', 'confused',
   'Five things it does that surprise people',
   'It eats everything. It handles salty water. It tastes with its skin. It reproduces fast.',
   'Let me make this concrete with my slide of fun facts. It eats everything. It handles salty water — that is the surprise. It literally tastes with its skin. And it reproduces fast. Keep those four in mind and the whole invasion story makes sense.',
   '/deck/slide04.jpg', 0),

  ('Background', 1, 'visual', 'confused',
   'Where it came from',
   'Native to the Mississippi, Missouri and Ohio drainages. Introduced to the James, York and Rappahannock in the 1970s-80s.',
   'My slide shows the map of how it got here. It was never from here — native to the Mississippi, Missouri and Ohio river systems. In the 1970s and 80s it was brought to the James, York and Rappahannock rivers on purpose, for sport fishing.',
   '/deck/slide05.jpg', 0),

  ('History', 1, 'visual', 'confused',
   'The escape plan',
   'The plan: a new recreational fishery. The reality: they tolerate brackish water and spread to every Bay tributary.',
   'Here is the part people miss. The plan was a new recreational fishery. Everyone assumed these fish would stay in freshwater. They do not — they tolerate brackish water, so they walked out of those rivers and are now in every tributary of the Chesapeake, on both shores.',
   '/deck/slide06.jpg', 0),

  ('Why Are They Invasive', 2, 'visual', 'confused',
   'Definition first, then the fit',
   'An invasive species: non-native, spreads widely outside its natural habitat, and causes harm to the environment, the economy, or human health. The blue catfish checks every box.',
   'Start from the definition on my slide. Invasive means: non-native, spreading widely outside its natural habitat, and causing harm to the environment, the economy, or human health. Now check the blue catfish against that — non-native, spreading, and eating the Bay''s economy. Every box, checked.',
   '/deck/slide07.jpg', 0),

  ('The Chesapeake Bay', 3, 'visual', 'confused',
   'What the Bay holds',
   '348 finfish species, 173 shellfish species. Blue crab, oysters, striped bass. Home of the endangered Atlantic sturgeon.',
   'Here is what is at stake. The Chesapeake holds 348 finfish species and 173 shellfish species — blue crab, oysters, striped bass, even the endangered Atlantic sturgeon. This is one of the most productive estuaries on the planet, and it is the dinner plate the blue catfish moved into.',
   '/deck/slide08.jpg', 0),

  ('The Blue Crab', 3, 'visual', 'confused',
   'The iconic victim',
   'The blue crab is the Chesapeake''s most iconic and most valuable species. Blue catfish eat them year-round.',
   'My slide says it plainly: the blue crab. The Bay''s most iconic and most valuable species — and blue catfish eat them year-round. Not occasionally. Year-round. That is the ecosystem-level threat in one picture.',
   '/deck/slide09.jpg', 0),

  ('Dangers Of The Blue Catfish', 4, 'visual', 'confused',
   'Eats 8-9% of its body weight, daily',
   'Competes with native predators, eats its competitors, devours eggs — throwing off the food web.',
   'The number that matters is on my slide: it eats eight to nine percent of its body weight every single day. It out-competes native predators, eats its competitors, and devours their eggs — throwing the whole food web off balance.',
   '/deck/slide11.jpg', 0),

  ('Invasion By Numbers', 4, 'visual', 'confused',
   'The scale, in numbers',
   'One stomach, one picture: what a single blue catfish was found to have eaten (USGS, Jay Fleming).',
   'Look at this photo from USGS — the stomach contents of one blue catfish. That is one fish, one day. Now put the invasion-by-numbers frame around it and the scale stops being abstract.',
   '/deck/slide12.jpg', 0),

  ('What Are Experts Doing', 5, 'visual', 'confused',
   'Who is fighting it, where',
   'MD DNR · Patuxent — where they roam. Virginia Tech · James — the numbers. Salisbury University — what they eat. VIMS · James River — protecting crabs by targeting young juveniles. Mid-size catfish are the biggest crab eaters.',
   'This is who is on it. Maryland DNR with Patuxent tracks where they roam. Virginia Tech on the James counts the numbers. Salisbury studies what they eat. And VIMS protects the crabs by targeting young juveniles — because mid-size catfish are the biggest crab eaters.',
   '/deck/slide13.jpg', 0),

  ('Mitigation', 5, 'visual', 'confused',
   'Fishing as the solution',
   'Low-frequency electrofishing boats: up to 6,000 fish an hour. UMD dining halls served 7,265 lbs in one semester. Bay Program Workgroup unites MD, VA, PA, DC and NOAA.',
   'Here is the encouraging slide. Low-frequency electrofishing boats have pulled up six thousand fish in an hour. Maryland''s own initiative: UMD dining halls served over seven thousand pounds of it in one semester. And the Bay Program workgroup unites Maryland, Virginia, Pennsylvania, DC and NOAA on one strategy.',
   '/deck/slide14.jpg', 0),

  ('How You Can Help', 6, 'visual', 'confused',
   'EAT THEM.',
   'Fish smart. Catch and batch it. Support the watermen. Spread the word.',
   'And the conclusion is my favorite slide. EAT THEM. Fish smart — catch it and batch it. Support the watermen who harvest them. And spread the word. The most effective thing you can do for the Chesapeake tonight is order the blue catfish.',
   '/deck/slide15.jpg', 0)
on conflict (section, variant, title) do nothing;
