import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = "slide-audio";
const FOLDER = "sections_v1";

async function generateAndUpload(text: string, fileName: string): Promise<string> {
  // Skip regenerating if it already exists in Storage
  const { data: existing } = await supabase.storage
    .from(BUCKET)
    .list(FOLDER, { search: fileName.split("/").pop() });

  if (existing && existing.length > 0) {
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return urlData.publicUrl;
  }

  const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text,
    }),
  });

  if (!ttsResponse.ok) {
    const errText = await ttsResponse.text();
    throw new Error(`TTS failed: ${errText}`);
  }

  const arrayBuffer = await ttsResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, buffer, {
      contentType: "audio/mpeg",
      upsert: true,
    });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  return urlData.publicUrl;
}

export async function POST(req: Request) {
  try {
    const { sections, intro, conclusion } = await req.json();
    if (!sections) throw new Error("Missing sections data");
    if (!process.env.OPENAI_API_KEY) throw new Error("Missing OpenAI API key");

    const audioUrls: Record<string, string> = {};

    // Intro narration
    if (intro) {
      audioUrls["intro"] = await generateAndUpload(intro, `${FOLDER}/intro.mp3`);
    }

    // Conclusion narration
    if (conclusion) {
      audioUrls["conclusion"] = await generateAndUpload(conclusion, `${FOLDER}/conclusion.mp3`);
    }

    // Per-section narration + breakdown audio
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      if (section.narration) {
        audioUrls[`section${i}_narration`] = await generateAndUpload(
          section.narration,
          `${FOLDER}/section${i + 1}_narration.mp3`
        );
      }

      if (section.breakdown?.simple) {
        audioUrls[`section${i}_simple`] = await generateAndUpload(
          section.breakdown.simple,
          `${FOLDER}/section${i + 1}_simple.mp3`
        );
      }

      if (section.breakdown?.detailed) {
        audioUrls[`section${i}_detailed`] = await generateAndUpload(
          section.breakdown.detailed,
          `${FOLDER}/section${i + 1}_detailed.mp3`
        );
      }
      
      if (section.breakdown?.realWorldExample) {
        audioUrls[`section${i}_example`] = await generateAndUpload(
          section.breakdown.realWorldExample,
          `${FOLDER}/section${i + 1}_example.mp3`
        );
      }
    }

    return NextResponse.json({ success: true, audioUrls });
  } catch (err: any) {
    console.error("Audio generation error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate audio" }, { status: 500 });
  }
}
