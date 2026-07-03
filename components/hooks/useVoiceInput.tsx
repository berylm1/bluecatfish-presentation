import { useRef, useState } from "react";

type Status = "idle" | "listening" | "processing";

export function useVoiceInput(apiKey: string, onTranscript: (text: string, response: JSON) => void) {
  const [status, setStatus] = useState<Status>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());

        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        const text = await transcribeAudio(blob, apiKey);
        

        const response = await chat_speech(text);
        onTranscript(text, response);


        setStatus("idle");
      };

      mr.start();
      mediaRecorderRef.current = mr;
      setStatus("listening");
    } catch {
      console.error("Mic permission denied");
    }
  };

  const stopListening = () => {
    mediaRecorderRef.current?.stop();
    setStatus("processing");
  };

  const toggleMic = () => {
    if (status === "listening") stopListening();
    else startListening();
  };

  return { status, toggleMic };
}


// ---- reuse your existing function ----
async function transcribeAudio(audioBlob: Blob, apiKey: string) {
  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  formData.append("model", "whisper-1");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  const data = await res.json();
  return data.text;
}



async function chat_speech(text: string) {
  console.log("text received:", text)
  // const response = "test data"

  const response = await fetch("/api/conversational/respond", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${"dummy apiKey"}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      // Remove response_format if you aren't forcing the AI to return JSON code
      userText: text,
      conversation: [],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Failed to fetch from OpenAI");
  }
  console.log("response data from speech to text:", response)
  return await response.json(); // Return the parsed data


}
