import React, { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'ai';
  text: string;
}

export default function ChatInterface() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: "Hello! I am the Blue Catfish expert. Ask me anything about what you've learned today!" }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    // Small timeout ensures layout is painted before scrolling
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-focus logic
  useEffect(() => {
    if (!isLoading) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isLoading]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/conversational/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userText: userMessage.text,
          conversation: messages.map(m => ({
            role: m.role === 'ai' ? 'assistant' : 'user', 
            content: m.text 
          })),
          systemPrompt: "You are an expert on Blue Catfish in the Chesapeake Bay. Keep answers concise, fun, and educational."
        })
      });

      const data = await response.json();

      if (data.reply) {
         setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
      } else {
         const errorMessage = data.error?.message || "Error connecting to OpenAI.";
         setMessages(prev => [...prev, { role: 'ai', text: `Error: ${data.error}` }]);
      }

    } catch (error) {
      console.error("Network Error:", error);
      setMessages(prev => [...prev, { role: 'ai', text: "Oops! Network error." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // ROOT: Full height, flex column
    <div className="w-full h-full flex flex-col relative">
      
      {/* HEADER: Fixed height (flex-none) */}
      <h1 className="flex-none text-4xl font-extrabold text-slate-900 mb-6 tracking-tight border-l-8 border-purple-600 pl-6">
        Any Questions?
      </h1>

      {/* LAYOUT FIX: 
         This wrapper takes all remaining space (flex-1) and creates a context (relative)
         for the absolute positioned child. 
      */}
      <div className="flex-1 relative min-h-0 bg-white/50 rounded-xl">
        
        {/* SCROLL AREA: 
           Pinned to all 4 corners (inset-0) of the parent wrapper.
           'overflow-y-auto' handles the scrolling.
           This decouples the content size from the flex container size.
        */}
        <div className="absolute inset-0 overflow-y-auto p-2 custom-scrollbar space-y-4">
          
          {messages.map((msg, index) => (
            <div key={index} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] p-4 rounded-2xl text-lg shadow-sm leading-relaxed ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start w-full">
              <div className="bg-slate-100 p-4 rounded-2xl rounded-tl-none border border-slate-200 flex gap-2 items-center">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></div>
              </div>
            </div>
          )}
          
          {/* Scroll anchor */}
          <div ref={messagesEndRef} className="h-1" />
        </div>
      </div>

      {/* INPUT AREA: Fixed height (flex-none), pinned to bottom via flex layout */}
      <div className="flex-none mt-4 flex gap-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type your question here..."
          className="flex-1 p-4 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-slate-700 text-lg"
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-8 rounded-xl font-bold text-lg transition-colors shadow-lg"
        >
          Send
        </button>
      </div>
    </div>
  );
}
