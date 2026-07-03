import { useAIStore } from "@/store/useAIStore";

import React, { useEffect,useRef, useState } from "react";

interface AICharacterProps {
  speechText: string;
}

export default function AICharacter({ speechText }: AICharacterProps) {

  const { cached_text, cached_response } = useAIStore();
  const [aiResponse, setAiResponse] = useState<string>("");
  const [userQuery, setUserQuery] = useState<string>("");
  const [showResponse, setShowResponse] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);


  useEffect(() => {
    if (cached_text && cached_text !== "Nothing") {
      setShowResponse(true);

      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(() => {
        setShowResponse(false);
      }, 60000);
    }
  }, [cached_text]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-end pb-0">

      {/* Cached AI Response */}
      {showResponse  && (
        <div className="relative bg-white p-6 rounded-3xl shadow-2xl border-4 border-blue-400 mb-6 w-full max-w-[90%]">
          <div className="max-h-[180px] overflow-y-auto pr-2">
            <p className="text-slate-800 text-lg font-bold italic">
              <span className="block text-blue-600 text-sm mb-1">
                User's Question:
              </span>
              {cached_text}

              <span className="block text-blue-600 text-sm mt-3 mb-1">
                AI Response:
              </span>
             {cached_response}
            </p>
          </div>
        </div>
      )}

      {/* Speech Text */}
      <div className="relative bg-white p-6 rounded-3xl shadow-2xl border-4 border-blue-400 mb-6 w-full max-w-[90%]">
        <div className="max-h-[180px] overflow-y-auto pr-2">
          <p className="text-slate-800 text-lg font-bold italic">
            "{speechText || "Click a point on the left to learn more!"}"
          </p>
        </div>

        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-white border-r-4 border-b-4 border-blue-400 rotate-45"></div>
      </div>

      {/* Mascot */}
      <div className="relative group scale-90 origin-bottom">
        <div className="w-56 h-56 bg-gradient-to-t from-blue-500 to-blue-400 rounded-full flex items-center justify-center shadow-[0_20px_50px_rgba(239,68,68,0.3)] border-8 border-white relative overflow-hidden transition-transform duration-500 group-hover:rotate-6">
          <span className="text-[9rem]">🦀</span>
        </div>
      </div>
    </div>
  );
}
