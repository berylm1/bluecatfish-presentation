"use client";

import { useState, useEffect, useRef } from "react";
import SlideContent from "@/components/SlideContent";
import AICharacter from "@/components/AICharacter";
import Navigation from "@/components/Navigation";
import Quiz from "@/components/Quiz";
import ChatInterface from "@/components/ChatInterface";
import { createClient } from "@/lib/supabase/client";      
import PreferenceSelector from "@/components/PreferenceSelector";
import styles from "./learning.module.css";

// ===================== QUIZ DATA =====================
const QUIZ_DATA = [
  {
    question: "What is the key feature to distinguish a Blue Catfish from other native catfish?",
    options: [
      "It has green spots",
      "It has a deeply forked tail",
      "It has a square tail",
      "It has no whiskers",
    ],
    correctAnswer: 1,
  },
  {
    question: "Why are Blue Catfish considered invasive in the Chesapeake Bay?",
    options: [
      "They are too small to catch",
      "They help clean the water too much",
      "They eat native species like Blue Crabs and have no natural enemies",
      "They only eat plants",
    ],
    correctAnswer: 2,
  },
];

// ===================== MAIN COMPONENT =====================
export default function LearningTool() {
  const [slidesData, setSlidesData] = useState<any[]>([]);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [isSlidesLoading, setIsSlidesLoading] = useState(true);
  const [isAudioLoading, setIsAudioLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [activeBullet, setActiveBullet] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState("");
  const [visualPref, setVisualPref] = useState<string>("low");
  const [prefsLoaded, setPrefsLoaded] = useState(false);  
  const [hasPrefs, setHasPrefs] = useState(false);         
  const [prefs, setPrefs] = useState<any>(null);     
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const checkPrefs = async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
  
      const { data: prefsRow } = await supabase
        .from("user_preferences")
        .select("text_pref, audio_pref, image_pref")
        .eq("user_id", userData.user.id)
        .maybeSingle();
  
      if (prefsRow) {
        setPrefs(prefsRow);
        setHasPrefs(true);
        // has prefs → go straight to generation
      } else {
        setHasPrefs(false);
        // no prefs → show selector, DON'T generate
      }
      setPrefsLoaded(true);
    };
    checkPrefs();
  }, []);
  // ===================== FETCH AI SLIDES ON LOAD =====================
  useEffect(() => {
    if (!hasPrefs || !prefs) return;
    
    const fetchSlides = async () => {
      try {
        const textPref = prefs.text_pref;
        const audioPref = prefs.audio_pref;
        const visualPref = prefs.image_pref;
        setVisualPref(prefs.image_pref ?? "low");
        
        const slidesRes = await fetch("/api/slides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ textPref, audioPref, visualPref }),
        });

        const slidesResult = await slidesRes.json();
        if (slidesResult.error) throw new Error(slidesResult.error);
        
       const slides = slidesResult.slides
        
        setSlidesData(slides);
        setIsSlidesLoading(false);

        if (audioPref !== "none") {
          const audioRes = await fetch("/api/write-mp3", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slides, textPref, audioPref, visualPref }),
          });
  
          const audioResult = await audioRes.json();
  
          if (audioResult.audioUrls) {
            setAudioUrls(audioResult.audioUrls);
          }
        }
      } catch (err) {
        console.error("Slide/audio fetch failed:", err);
        setSlidesData([
          {
            title: "Blue Catfish Invasion",
            image: "",
            bullets: [
              { mainText: "Invasive Species", detail: "Blue Catfish are spreading rapidly in Chesapeake Bay." },
              { mainText: "Threat", detail: "They consume native fish and crabs, harming the ecosystem." },
              { mainText: "Human Role", detail: "Humans introduced them for fishing, causing imbalance." },
            ],
          },
        ]);
        setIsSlidesLoading(false)
      } finally {
        setIsSlidesLoading(false);
        setIsAudioLoading(false);
      }
    };

    fetchSlides();
  }, [hasPrefs, prefs]);

  // ===================== PAGE LOGIC =====================


  // --- Calculate Page Logic ---
  const SLIDE_COUNT = slidesData.length; // 8
  const QUIZ_COUNT = QUIZ_DATA.length;    // 2
  const CHAT_COUNT = 1;                   // 1

  // Total pages = 8 + 2 + 1 = 11
  const totalSlides = SLIDE_COUNT + QUIZ_COUNT + CHAT_COUNT;

  // --- Determine Current Mode based on 'currentStep' ---
  // Step 0-7: Content Slides
  const isSlideMode = currentStep < SLIDE_COUNT;
  // Step 8-9: Quiz
  const isQuizMode = currentStep >= SLIDE_COUNT && currentStep < (SLIDE_COUNT + QUIZ_COUNT);
  // Step 10: Chat
  const isChatMode = currentStep === totalSlides - 1;

  // Get relevant data
  const currentSlideData = isSlideMode ? slidesData[currentStep] : null;
  const currentQuizData = isQuizMode ? QUIZ_DATA[currentStep - SLIDE_COUNT] : null;
  // ===================== AUDIO =====================
  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };
  
 const triggerAudio = (slideIndex: number, bulletIndex: number) => {
    // 1. Stop previous audio
    stopAudio();

    // 2. Audio is only for Slide Mode (0-7). Quiz and Chat don't have pre-recorded audio.
    if (!isSlideMode) return;

    // 3. Supabase Storage URLs
    const url = audioUrls[`${slideIndex}_${bulletIndex}`];
    if (!url) {
      console.warn("No audio URL found for this bullet yet");
      return;
    }

    // 4. Play audio
    const newAudio = new Audio(url);
    audioRef.current = newAudio;
    newAudio.play().catch((error) => {
      console.warn("Audio playback failed:", error);
    });
  };

  useEffect(() => {
    stopAudio();
    setQuizFeedback("");
  }, [currentStep]);

  // ===================== HANDLERS =====================
  const handleNext = () => {
    if (currentStep < totalSlides - 1) {
      setCurrentStep((s) => s + 1);
      setActiveBullet(0);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      setActiveBullet(0);
    }
  };

  const handleBulletClick = (index: number) => {
    setActiveBullet(index);
    triggerAudio(currentStep, index);
  };

  const handleQuizAnswer = (isCorrect: boolean) => {
    setQuizFeedback(isCorrect ? "That's correct! 🎉" : "Oops! That's not quite right.");
  };

  const getAISpeech = () => {
    if (isSlideMode && currentSlideData) return currentSlideData.bullets[activeBullet]?.detail;
    if (isQuizMode) return quizFeedback || "Read the question and choose the best answer.";
    if (isChatMode) return "I am ready for your questions!";
    return "";
  };

  // ===================== LOADING SCREEN =====================
  if (!prefsLoaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-2xl font-semibold">
        Loading...
      </div>
    );
  }

  if (!hasPrefs) {
    return (
      <PreferenceSelector
        onComplete={(newPrefs: any) => {
          setPrefs(newPrefs);
          setHasPrefs(true); // triggers the gated fetchSlides useEffect
        }}
      />
    );
  }
  if (isSlidesLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-2xl font-semibold">
        Generating AI Slides...
      </div>
    );
  }
  // ===================== RENDER =====================
  return (
    // <main className="h-screen w-screen bg-slate-50 flex flex-col overflow-hidden text-slate-900">
    <div className={styles.wrapper}>
    <main className="h-screen w-screen bg-slate-50 flex flex-col overflow-y-auto text-slate-900">
      <div className="flex-1 flex flex-row p-10 gap-10">
        <section className="flex-[3] bg-white rounded-[3rem] shadow-xl p-12 border border-slate-100 relative overflow-hidden flex flex-col">
          {isSlideMode && currentSlideData && (
          <>
            {isAudioLoading && (
                <div className="absolute top-4 right-6 rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700 shadow-sm">
                  🔊 Preparing audio…
                </div>
              )}
            <SlideContent data={currentSlideData} activeBullet={activeBullet} onBulletClick={handleBulletClick} visualPref={visualPref}/>
          </>
          )}
          {isQuizMode && currentQuizData && <Quiz data={currentQuizData} onAnswerSelected={handleQuizAnswer} />}
          {isChatMode && <ChatInterface />}
        </section>

        <section className="flex-[2] flex flex-col justify-between py-10">
          <AICharacter speechText={getAISpeech()} />
        </section>
      </div>

      <footer className="h-28 bg-white/80 backdrop-blur-md border-t border-slate-200 px-16 flex items-center shadow-inner">
        <Navigation current={currentStep} total={totalSlides} onNext={handleNext} onPrev={handlePrev} />
      </footer>
    </main>
    </div>
  );
}
