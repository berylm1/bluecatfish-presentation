import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getValue, setValue } from "@/src/redisClient";


const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only, bypasses RLS
);

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

async function getRagContext(topic: string, matchCount = 4): Promise<string> {
  const queryEmbedding = await embed(topic);
  const { data, error } = await supabase.rpc("match_documents2", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
  });
  if (error) throw new Error(`RAG lookup failed: ${error.message}`);
  return (data ?? []).map((row: any) => row.content).join("\n\n");
}

async function generateSingleSlide(
  ragContext: string,
  promptGuidance: string,
  slideTopic: string,
  slideNum: number,
  attempt = 1
): Promise<any> { 
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an educational assistant.
              Base every fact strictly on the SOURCE CONTENT below — do not invent facts.

              SOURCE CONTENT:
              """${ragContext}"""
              
              ${promptGuidance}

            CRITICAL: The "bullets" array MUST contain EXACTLY 3 items. Not 1, not 2 — exactly 3. If the source content is limited, generate 3 bullets anyway by covering different angles of the same topic (e.g. what/why/impact).
            
            Output ONLY a JSON object with key "slide": a single object structured like this:
            
            {
              "title": "String",
              "image": "",
              "bullets": [
                { "main": "...", "detail": "...", "audio": "..." },
                { "main": "...", "detail": "...", "audio": "..." },
                { "main": "...", "detail": "...", "audio": "..." }
              ]
            }`,
        },
        {
          role: "user",
          content: `Generate slide ${slideNum} about: ${slideTopic}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from AI (batch)");
  
  const parsed = JSON.parse(content);
  const slide = parsed.slide ?? parsed;

  if ((!slide.bullets || slide.bullets.length !== 3) && attempt < 2) {
  console.warn(`Slide ${slideNum} had ${slide.bullets?.length} bullets, retrying...`);
  return generateSingleSlide(ragContext, promptGuidance, slideTopic, slideNum, attempt + 1);
  }

  return slide;
}

export async function POST(req: Request) {
  try {
    const { textPref, audioPref, visualPref, topic } = await req.json();
    
    if (!textPref || !audioPref || !visualPref) {
      return NextResponse.json({ error: "Missing preference values" }, { status: 400 });
    }

    const cacheKey = `bluecatfish_slides_ai:t-${textPref}_a-${audioPref}_v-${visualPref}`;

    const cachedRaw = await getValue(cacheKey);
    if (cachedRaw) {
      return NextResponse.json({ slides: JSON.parse(cachedRaw), source: "cache" });
    }

    const slideTopics = [
      "introduction and origin of Blue Catfish",
      "habitat range and salinity tolerance", // merged, since these overlapped
      "biomass dominance and population size in rivers",
      "feeding habits and predatory behavior",
      "impact on native species like blue crabs and menhaden",
      "ecosystem and policy response",
      "commercial harvesting and chef/consumer demand",
      "long-term mitigation and population control strategies",
    ];

    const textInstructions = {
      low: "Each bullet's 'main' must be 3-5 words — just the single most critical phrase, no full sentence.",
      medium: "Each bullet's 'main' must be one concise full sentence, 8-15 words.",
      high: "Each bullet's 'main' must be a detailed sentence or two, 20-35 words, including specific facts/numbers from the source content.",
      max: "Each bullet's 'main' must be a rich, thorough explanation, 50-70 words, covering multiple facts/numbers and nuance from the source content.",
    }[textPref];

    const audioInstructions = {
      none: "Set 'audio' to an empty string \"\" for every bullet — no narration should be generated.",
      low: "Each bullet's 'audio' must be ONE sentence, MAXIMUM 12 words. Count carefully — do not exceed 12 words.",
      medium: "Each bullet's 'audio' must be 2-3 sentences, between 15-25 words.",
      high: "Each bullet's 'audio' must be a full paragraph, 28-38 words, elaborating with extra context and detail.",
    }[audioPref]; 
    
    const promptGuidance = `
      STRICT RULES YOU MUST FOLLOW:
      1. ${textInstructions}
      2. ${audioInstructions}
      3. Text length and audio length are independent — e.g. a "low" main (short phrase) can still be paired with a "high" audio narration (full paragraph), since they are generated separately.
      4. "main" and "audio" must use DIFFERENT wording from each other  
      5. "detail" must always be a short 5-10 word phrase summarizing the bullet's topic, regardless of text level — this is separate from "main".
      6. Visual preferences (${visualPref}) - ignore for now, images are static placeholders.
    `;

    const matchCounts = {
      low: 3,
      medium: 4,
      high: 5,
      max: 6,
    }[textPref];
    
    const ragContexts = await Promise.all(
      slideTopics.map((t) => getRagContext(t, matchCounts))
    );
    
    const slides = await Promise.all(
      slideTopics.map((t, i) =>
        generateSingleSlide([i], promptGuidance, t, ragContexts[i] + 1)
      )
    );
    
    await setValue(cacheKey, JSON.stringify(slides));
    return NextResponse.json({ slides, source: "generated" });
    
  } catch (err: any) {
    console.error("Slide generation error:", err);
    return NextResponse.json({ error: err.message || "Failed to get slides" }, { status: 500 });
  }
}
