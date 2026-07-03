import React, { useState, useEffect } from 'react';

interface QuizProps {
  data: {
    question: string;
    options: string[];
    correctAnswer: number;
  };
  onAnswerSelected?: (isCorrect: boolean) => void;
}

export default function Quiz({ data, onAnswerSelected }: QuizProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  useEffect(() => {
    setSelectedOption(null);
  }, [data]);

  const handleOptionClick = (index: number) => {
    if (selectedOption !== null) return; // Prevent changing answer

    setSelectedOption(index);
    
    const isCorrect = index === data.correctAnswer;
    if (onAnswerSelected) {
      onAnswerSelected(isCorrect);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Title Section (Consistent with Slides) */}
      <h1 className="text-4xl font-extrabold text-slate-900 mb-8 tracking-tight border-l-8 border-yellow-500 pl-6">
        Knowledge Check
      </h1>

      {/* Split Layout: Left for Question, Right for Options */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        
        {/* Left Column: The Question */}
        <div className="flex flex-col justify-center space-y-6">
          <div className="inline-block self-start bg-yellow-100 text-yellow-800 font-bold px-4 py-2 rounded-full text-sm uppercase tracking-wider mb-4">
             Quiz Question
          </div>
          <h2 className="text-3xl font-bold text-slate-800 leading-tight">
            {data.question}
          </h2>
          <p className="text-slate-500 text-lg italic">
            Select the best answer from the right 👉
          </p>
        </div>

        {/* Right Column: The Options */}
        <div className="flex flex-col gap-3 justify-center h-full">
          {data.options.map((option, index) => {
            let buttonStyle = "bg-slate-50 border-slate-200 text-slate-700 hover:bg-white hover:border-blue-400 hover:shadow-md";
            
            // Coloring logic
            if (selectedOption !== null) {
              if (index === data.correctAnswer) {
                // Correct: Green
                buttonStyle = "bg-green-500 border-green-600 text-white shadow-md ring-2 ring-green-200";
              } else if (index === selectedOption && index !== data.correctAnswer) {
                // Wrong: Red
                buttonStyle = "bg-red-500 border-red-600 text-white shadow-md opacity-50";
              } else {
                // Others: Fade out
                buttonStyle = "bg-slate-50 border-slate-100 text-slate-300 opacity-40";
              }
            }

            return (
              <button
                key={index}
                onClick={() => handleOptionClick(index)}
                disabled={selectedOption !== null}
                className={`w-full text-left px-6 py-5 rounded-xl border-2 transition-all duration-300 flex items-center gap-4 ${buttonStyle}`}
              >
                {/* A/B/C/D Circle */}
                <span className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm border ${
                   selectedOption !== null && (index === data.correctAnswer || index === selectedOption)
                   ? "bg-white/20 border-white/50 text-white" 
                   : "bg-white border-slate-300 text-slate-500"
                }`}>
                  {String.fromCharCode(65 + index)}
                </span>
                
                <span className="text-lg font-semibold leading-snug">
                  {option}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
