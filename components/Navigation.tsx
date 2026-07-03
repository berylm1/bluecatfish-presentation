import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Mic } from 'lucide-react';
import { useVoiceInput  } from "@/components/hooks/useVoiceInput";
import { Redis } from "@upstash/redis";
import { useAIStore } from "@/store/useAIStore";

interface NavigationProps {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}
interface AIStore {
  aiResponse: string;
  setResponse: (msg: string) => void;
}

export default function Navigation({ current, total, onPrev, onNext }: NavigationProps) {
  const progress = ((current + 1) / total) * 100;

  const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY!;
   // 1. Create a state to hold the AI's response
  const [aiResponse, setAiResponse] = useState<string>("");
   const [user_query, setUserQuery] = useState<string>("");


const { setAIData } = useAIStore();

  const { toggleMic, status } = useVoiceInput(apiKey, (text, response) => {
    console.log("User said:", text);
    console.log("API response", response)
    console.log("user said one more:", status)
    
    if (text){
      // setUserQuery(text)

      if (response) {

        // setAiResponse(response.choices?.[0]?.message?.content || response);
        const temp = response.choices?.[0]?.message?.content
         setAIData(text, temp); 

      //   try {
      //                const redis = new Redis({
      //                 url:  process.env.UPSTASH_REDIS_REST_URL,
      //                 token: process.env.UPSTASH_REDIS_REST_TOKEN
      //             });

      //   const CACHE_KEY_TEXT = "learning_ai_user_";
      //   redis.set(CACHE_KEY_TEXT, text);
      //   const CACHE_KEY_RESPONSE = "learning_ai_response";
      //   const cache_key_response_data = response.choices?.[0]?.message?.content || response
      //   redis.set(CACHE_KEY_RESPONSE, cache_key_response_data);
        
      //   console.log(cache_key_response_data)

      // }catch(err)
      // {
      //        console.error("AI Learning interaction response failed:", err);
      // }
    }}
  });

  return(
    
  
    <div className="flex flex-row items-center w-full gap-10">

      {/* 3. Display the Response Box
      {aiResponse && (
        <div className="p-4 mb-4 bg-blue-50 border border-blue-200 rounded-xl text-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <p className="font-bold text-sm text-blue-600 mb-1">
            User's Question: </p>{user_query}
            <p className="font-bold text-sm text-blue-600 mb-1">
            AI Response:</p>
          {aiResponse}
        </div>
      )} */}
      
      {/* Progress Info */}
      <div className="flex items-center gap-4 min-w-[150px]">
        <span className="text-slate-400 font-bold text-xl">
          {String(current + 1).padStart(2, '0')}
          <span className="mx-2 text-slate-200">/</span>
          {String(total).padStart(2, '0')}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex gap-4">

        {/* Prev */}
        <button
          onClick={onPrev}
          disabled={current === 0}
          className="p-4 rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:text-blue-500 disabled:opacity-30 transition-all"
        >
          <ChevronLeft size={28} />
        </button>

        {/* Next */}
        <button
          onClick={onNext}
          disabled={current === total - 1}
          className="px-8 py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow-lg shadow-blue-200 disabled:opacity-30"
        >
          Next Slide <ChevronRight size={24} />
        </button>

        {/* Mic */}
        <button
          onClick={toggleMic}
          className={`px-6 py-4 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg
            ${status === "listening"
              ? "bg-red-500 text-white animate-pulse"
              : "bg-blue-600 text-white hover:bg-blue-700"}
          `}
        >
          <Mic size={20} />
          {status === "listening" ? "Listening..." : "Speak"}
        </button>

      </div>
    </div>
  );
}
