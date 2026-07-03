"use client";

import { useState, useEffect, useRef } from "react";
import SlideContent from "@/components/SlideContent";
import AICharacter from "@/components/AICharacter";
import Navigation from "@/components/Navigation";
import Quiz from "@/components/Quiz";
import ChatInterface from "@/components/ChatInterface";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";


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
  const router = useRouter();
  const [slidesData, setSlidesData] = useState<any[]>([]);
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const [isSlidesLoading, setIsSlidesLoading] = useState(true);
  const [isAudioLoading, setIsAudioLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [activeBullet, setActiveBullet] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);


  // ===================== FETCH AI SLIDES ON LOAD =====================
  useEffect(() => {
    const fetchSlides = async () => {
      try {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) throw new Error("Not logged in");

        const { data: prefsRow } = await supabase
          .from("user_preferences")
          .select("text_pref, audio_pref, image_pref")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (!prefsRow) {
          router.push("/components/PreferenceSelector.tsx"); // adjust to your actual preference route
          return;
        }  
        const textPref = prefsRow.text_pref;
        const audioPref = prefsRow.audio_pref;
        const visualPref = prefsRow.image_pref;

        const slidesRes = await fetch("/api/slides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ textPref, audioPref, visualPref }),
        });

        const slidesResult = await slidesRes.json();
        if (slidesResult.error) throw new Error(slidesResult.error);
        
       const slides = slidesResult.slides
        
        const demoImages = [
          "https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/styles/full_width/public/media/images/Chesapeake_base_V6.jpg?itok=-cALA8Ab",
          "https://dnr.maryland.gov/fisheries/PublishingImages/FishMD_Fish/blue_catfish.png",
          "https://chesapeakebaystory.umces.edu/site/assets/files/1048/blue-crab-dfodge-maryland_cbf.jpg",
          "https://assets.simpleviewinc.com/simpleview/image/upload/c_fill,h_799,q_75,w_1200/v1/clients/virginia/CN21060703V_152_cfaa1935-8ab4-4b9f-87d3-58aee33d3e30.jpg",
          "https://easyshrimprecipes.com/wp-content/uploads/2025/04/easy-baked-catfish-fillet-recipe.jpg",
          "https://www.nutritionadvance.com/wp-content/uploads/2019/07/catfish-fillets-on-white-plate-face.jpg",
          "https://www.boaterexam.com/blog/media/posts/75/CDNTrad_Bass2024-199.jpg",
          "https://tse2.mm.bing.net/th/id/OIP.508iP5Sjm4niQ5etmpLCIgHaE8?rs=1&pid=ImgDetMain&o=7&rm=3",
        ];
        slides.forEach((slide: any, i: number) => {
          if (demoImages[i]) slide.image = demoImages[i];
        });

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
  }, []);

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
            <SlideContent data={currentSlideData} activeBullet={activeBullet} onBulletClick={handleBulletClick} />
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
  );
}
