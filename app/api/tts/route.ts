import { NextRequest } from 'next/server';
import { isTeacherVoice, voiceFor } from '@/lib/voice';
import { lessonOf } from '@/lib/canvas/lessonProfiles';
import { classmateOf } from '@/lib/classmates';
import { MAX, rateLimit, tooLarge } from '@/lib/rateLimit';
import { addUsage } from '@/lib/usage';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, 'tts');
    if (limited) return limited;
    const body = await request.json();
    const text = (body.text as string)?.trim();
    // Who speaks decides the voice (chosen here, not by the page): the professor, or a classmate (lib/classmates.ts)
    // was: const voice = (body.voice as string) || TTS_VOICE;
    const classmate = classmateOf(body.who);
    // (the teacher: the asking lesson's voice and delivery, lib/voice.ts voiceFor; the blue catfish lesson's are as before)
    const lessonProfile = await lessonOf(request);
    const teacher = voiceFor(lessonProfile);
    // (body.voice: the Lesson panel's "Hear it", one of the teacher voices only)
    const voice = classmate ? classmate.voice : isTeacherVoice(body.voice) ? body.voice : teacher.voice;

    if (text && text.length > MAX.ttsText) return tooLarge('text');
    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not set' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input: text,
        voice,
        // simple: the calm "simpler please" delivery
        instructions: classmate ? classmate.voiceInstructions : body.simple ? teacher.simple : teacher.instructions,
        response_format: 'mp3',
      }),
      // (OpenAI not answering, or its stream stalling: the request ends instead of hanging; the page goes on without the clip)
      signal: AbortSignal.timeout(25_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // (the details stay in the server's log: OpenAI's error text isn't for the page)
      console.error('TTS request failed:', response.status, errorText.slice(0, 500));
      return new Response(
        JSON.stringify({ error: 'TTS request failed' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // (counted for the lesson's "AI use so far", lib/usage.ts; not waited for: the voice starts at once)
    void addUsage(lessonProfile.lessonId, { voiceChars: text.length });
    return new Response(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('TTS error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate speech' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
