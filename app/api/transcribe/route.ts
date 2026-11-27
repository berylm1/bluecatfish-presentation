import { NextResponse } from "next/server";
import { MAX, rateLimit, tooLarge } from "@/lib/rateLimit";

export async function POST(req: Request) {
  try {
    const limited = await rateLimit(req, "transcribe");
    if (limited) return limited;
    if (Number(req.headers.get("content-length") ?? 0) > MAX.audioBytes) return tooLarge("recording");
    const incoming = await req.formData().catch(() => null);
    if (!incoming) return NextResponse.json({ error: 'No recording' }, { status: 400 });
    const file = incoming.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No recording" }, { status: 400 });
    if (file.size > MAX.audioBytes) return tooLarge("recording");

    const formData = new FormData();
    formData.append("file", file, file.name || "recording.webm");
    formData.append("model", "gpt-transcribe");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Transcription failed: ${errText}`);
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text });
  } catch (err: any) {
    console.error("Transcription error:", err);
    return NextResponse.json(
      { error: "Failed to transcribe" },   // (was err.message: OpenAI's error text went to the page; it's in the log above)
      { status: 500 }
    );
  }
}
