import { NextResponse } from "next/server";
import { lazySupabaseAdmin } from "@/lib/supabase/admin";
import { requireIngestAdmin } from "@/lib/requireAdmin";

const supabase = lazySupabaseAdmin();   // created on first use, so the build doesn't need env vars

async function describeImage(imageUrl: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-6-luna",
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content: `Describe this image for a lesson about the Blue Catfish invasion in the Chesapeake Bay. State factually what is visible — subject, setting, notable details, scale, activity. Then, in the same description, state plainly how this image most likely relates to the lesson's themes: the fish itself, its size or biology, the native species it preys on, its ecosystem impact, commercial harvesting, cooking and eating it, or human response. Use the vocabulary someone would search for when looking for an image about that theme. 3-4 sentences. Describe only what you can see; when stating the likely relevance, keep it to the obvious connection, not speculation about specifics you cannot verify.`,
        },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_completion_tokens: 1250,
    }),
  });

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

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

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    // Corpus write path — restricted to ingest admins.
    const gate = await requireIngestAdmin(req);
    if (gate) return gate;

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const manualDescription = (formData.get("description") as string | null)?.trim() || null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    // Pictures only, and not huge: the type was taken from the browser as is,
    // so a web page or script could be stored (and served) as a "picture"
    if (!IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Upload a JPG, PNG, WebP or GIF picture." }, { status: 415 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "That picture is over 10 MB. Please make it smaller." }, { status: 413 });
    }

    // 1. Upload image to Supabase Storage (the name keeps only safe characters)
    // was: const fileName = `${Date.now()}_${file.name}`;
    const fileName = `${Date.now()}_${file.name.replace(/[^\w.-]+/g, "_").slice(-80)}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("slide-imagesv2")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // 2. Get public URL
    const { data: urlData } = supabase.storage
      .from("slide-imagesv2")
      .getPublicUrl(fileName);

    const url = urlData.publicUrl;

    
    // 3. Get and Embed the description
    const description = manualDescription ?? await describeImage(url);
    if (!description) throw new Error("Could not generate a description for this image");
    
    const embedding = await embed(description);

    // 4. Insert into images table
    const { error: insertError } = await supabase
      .from("images2")
      .insert({ url, description, embedding });

    if (insertError) throw new Error(`Insert failed: ${insertError.message}`);

    return NextResponse.json({ success: true, url, description });
  } catch (err: any) {
    console.error("Image ingestion error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to ingest image" },
      { status: 500 }
    );
  }
}
