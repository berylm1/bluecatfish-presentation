'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';

// ===================== TYPES =====================
interface Message {
  role: 'user' | 'ai';
  text: string;
}

interface SectionWithBreakdown {
  title: string;
  icon: string;
  image: string;
  content: string;
  stats: { value: string; label: string }[];
  narration: string;
  breakdown: {
    simple: string;
    detailed: string;
    keyTerms: { term: string; definition: string }[];
    realWorldExample: string;
  };
}

// ===================== STATIC INTRO/CONCLUSION SCRIPTS =====================
// Only intro + conclusion stay hardcoded — per-section narration now comes from the AI-generated sections.
const LECTURE_SCRIPTS = {
  intro: `Welcome to this presentation on Blue Catfish invasion in the Chesapeake Bay. I'm your professor, and today we'll explore one of the most significant ecological challenges facing the Bay ecosystem. Blue Catfish, once introduced for recreational fishing, have become an invasive species with far-reaching consequences. Let's dive in.`,
  conclusion: `So to summarize what we've learned today: Blue Catfish are an invasive species that were introduced for recreational fishing but have since become a major ecological threat. They eat enormous quantities of native species, make up the majority of fish biomass in many rivers, and have no natural predators to keep their numbers in check. However, there's hope. By commercial harvesting and encouraging consumption of Blue Catfish, we can reduce their population while enjoying a sustainable and delicious food source. Thank you for joining me in this presentation about the Chesapeake Bay's Blue Catfish invasion. Remember, sometimes the solution to an ecological problem can be found on our dinner plates.`
};

// ===================== STATIC PRESENTATION SHELL =====================
// Sections are no longer hardcoded — they're fetched from /api/slides2 on load.
const PRESENTATION = {
  title: "Why Are Blue Catfish Invasive?",
  subtitle: "Understanding the Chesapeake Bay Crisis",
  professor: {
    name: "Professor Marine",
    title: "Marine Biology & Conservation"
  }
};

// ===================== AUDIO PLAYER HOOK =====================
// Replaces useSpeechSynthesis. Plays pre-generated OpenAI TTS mp3 URLs instead of
// browser speechSynthesis or the local voicebox service.
const useAudioPlayer = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback((url: string | undefined, key: string) => {
    if (!url) {
      console.warn(`No audio URL found for "${key}"`);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    setCurrentKey(key);
    setIsSpeaking(true);
    setIsPaused(false);

    audio.onended = () => {
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentKey(null);
    };

    audio.onerror = () => {
      console.warn(`Audio playback failed for "${key}"`);
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentKey(null);
    };

    audio.play().catch((err) => {
      console.warn('Audio playback failed:', err);
      setIsSpeaking(false);
    });
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current && isSpeaking && !isPaused) {
      audioRef.current.pause();
      setIsPaused(true);
    }
  }, [isSpeaking, isPaused]);

  const resume = useCallback(() => {
    if (audioRef.current && isPaused) {
      audioRef.current.play();
      setIsPaused(false);
    }
  }, [isPaused]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
    setIsPaused(false);
    setCurrentKey(null);
  }, []);

  return { play, pause, resume, stop, isSpeaking, isPaused, currentKey };
};

// ===================== AI CHAT HOOK =====================
// Unchanged from before — already wired to /api/conversational/respond.
const useAIChat = () => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: `Good day! I'm ${PRESENTATION.professor.name}, and I'll be your guide through today's lecture on the Blue Catfish invasion in the Chesapeake Bay. Feel free to ask me any questions as we go through the material. What would you like to explore first?` }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMessage: Message = { role: 'user', text };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/conversational/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userText: text,
          topic: 'Blue Catfish invasion in the Chesapeake Bay',
          systemPrompt: `You are "${PRESENTATION.professor.name}", a university professor specializing in Marine Biology and Conservation. Your teaching style is engaging, academic yet accessible, and you use real-world examples to illustrate complex concepts.`,
          conversation: messages.map(m => ({
            role: m.role === 'ai' ? 'assistant' : 'user',
            content: m.text,
          })),
        }),
      });

      const data = await response.json();

      if (data.reply) {
        setMessages(prev => [...prev, { role: 'ai', text: data.reply }]);
      } else {
        console.error('No reply in response:', data);
        setMessages(prev => [...prev, { role: 'ai', text: "Sorry, I couldn't generate a response. Please try again." }]);
      }
    } catch (err) {
      console.error('RAG chat failed:', err);
      setMessages(prev => [...prev, { role: 'ai', text: "Sorry, I'm having trouble responding right now. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return { messages, isLoading, input, setInput, sendMessage };
};

// ===================== MAIN COMPONENT =====================
export default function AIPresentation() {
  // ---- Section + audio data (fetched, not hardcoded) ----
  const [sections, setSections] = useState<SectionWithBreakdown[]>([]);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [isContentLoading, setIsContentLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [isNarrating, setIsNarrating] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [showConclusion, setShowConclusion] = useState(false);

  const [confusedSections, setConfusedSections] = useState<Set<number>>(new Set());
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [breakdownLevel, setBreakdownLevel] = useState<'simple' | 'detailed'>('simple');
  const [confusionClicked, setConfusionClicked] = useState(false);

  const { play, pause, resume, stop, isSpeaking, isPaused, currentKey } = useAudioPlayer();
  const { messages, isLoading, input, setInput, sendMessage } = useAIChat();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---- Fetch sections, then fetch pre-generated audio for them ----
  useEffect(() => {
    async function loadPresentation() {
      try {
        const sectionsRes = await fetch('/api/slides2', { method: 'POST' });
        const sectionsData = await sectionsRes.json();

        if (sectionsData.error || !sectionsData.sections) {
          throw new Error(sectionsData.error || 'No sections returned');
        }

        setSections(sectionsData.sections);

        const audioRes = await fetch('/api/slides2/audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sections: sectionsData.sections,
            intro: LECTURE_SCRIPTS.intro,
            conclusion: LECTURE_SCRIPTS.conclusion,
          }),
        });
        const audioData = await audioRes.json();

        if (audioData.audioUrls) {
          setAudioUrls(audioData.audioUrls);
        }
      } catch (err: any) {
        console.error('Failed to load presentation:', err);
        setLoadError(err.message || 'Failed to load presentation content');
      } finally {
        setIsContentLoading(false);
      }
    }

    loadPresentation();
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ---- Narration handlers (now just play pre-generated audio by key) ----
  const narrateSection = (index: number) => {
    if (index < sections.length) {
      play(audioUrls[`section${index}_narration`], `section${index}_narration`);
      setIsNarrating(true);
      setShowConclusion(false);
    } else {
      play(audioUrls['conclusion'], 'conclusion');
      setIsNarrating(true);
      setShowConclusion(true);
    }
  };

  const handleConfused = () => {
    setConfusedSections(prev => new Set([...prev, activeSection]));
    setConfusionClicked(true);
    setShowBreakdown(true);
    setBreakdownLevel('simple');
    play(audioUrls[`section${activeSection}_simple`], `section${activeSection}_simple`);
  };

  const handleShowMore = () => {
    setBreakdownLevel('detailed');
    play(audioUrls[`section${activeSection}_detailed`], `section${activeSection}_detailed`);
  };

  const handleCloseBreakdown = () => {
    setShowBreakdown(false);
    setBreakdownLevel('simple');
    setConfusionClicked(false);
    stop();
  };

  const playIntroduction = () => {
    play(audioUrls['intro'], 'intro');
    setIsNarrating(true);
  };

  const startPresentation = () => {
    setShowIntro(false);
    setActiveSection(0);
    setShowConclusion(false);
    setTimeout(() => {
      playIntroduction();
      setTimeout(() => narrateSection(0), 5000);
    }, 500);
  };

  const nextSection = () => {
    setShowBreakdown(false);
    if (activeSection < sections.length - 1) {
      stop();
      const newIndex = activeSection + 1;
      setActiveSection(newIndex);
      setShowConclusion(false);
      setTimeout(() => narrateSection(newIndex), 300);
    } else if (activeSection === sections.length - 1) {
      stop();
      setShowConclusion(true);
      setTimeout(() => narrateSection(sections.length), 500);
    }
  };

  const prevSection = () => {
    setShowBreakdown(false);
    if (activeSection > 0) {
      stop();
      const newIndex = activeSection - 1;
      setActiveSection(newIndex);
      setTimeout(() => narrateSection(newIndex), 300);
    }
  };

  const currentSection = sections[activeSection];

  // ---- Loading / error states before rendering the presentation ----
  if (isContentLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-2xl font-semibold text-white bg-slate-900">
        Generating your lesson...
      </div>
    );
  }

  if (loadError || sections.length === 0) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-xl text-white bg-slate-900 text-center p-8">
        Something went wrong loading this lesson: {loadError || 'No sections available'}. Please try refreshing.
      </div>
    );
  }

  // ===================== RENDER =====================
  // Continue below with your existing JSX, with these changes:
  // 1. Replace every `PRESENTATION.sections[...]` reference with `sections[...]` (already done above via currentSection)
  // 2. Remove any UI referencing voiceType / changeVoiceType / voiceboxAvailable — that toggle no longer exists
  // 3. Any "speed/rate" slider tied to changeRate can be removed too, since OpenAI audio files play at fixed pace
  // 4. isSpeaking / isPaused / pause() / resume() / stop() all still work the same as before — just backed by real <audio> now
