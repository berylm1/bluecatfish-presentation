import React from 'react';


interface SlideContentProps {
  data: {
    title: string;
    image: string;
    bullets: { label: string;
     }[];
  };
  activeBullet: number;
  onBulletClick: (index: number) => void;
}

export default function SlideContent({ data, activeBullet, onBulletClick }: SlideContentProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Title Section */}
      <h1 className="text-4xl font-extrabold text-slate-900 mb-8 tracking-tight border-l-8 border-blue-600 pl-6">
        {data.title}
      </h1>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        {/* Left Column: Bullet Points List */}
        <div className="space-y-4">
          
          {/* NEW: Audio Hint Text */}
          <p className="text-slate-400 text-sm font-medium italic flex items-center gap-2 mb-2">
            <span>🎧</span> Click on a point to listen to the explanation
          </p>

          {data.bullets.map((bullet, index) => {
            const isActive = activeBullet === index;
            return (
              <button
                key={index}
                onClick={() => onBulletClick(index)}
                className={`w-full text-left p-6 rounded-2xl transition-all duration-300 shadow-sm border-2 ${
                  isActive 
                    ? "bg-blue-600 border-blue-700 text-white transform scale-[1.02] shadow-blue-200 shadow-lg" 
                    : "bg-slate-50 border-slate-100 text-slate-700 hover:bg-white hover:border-blue-300 hover:shadow-md"
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Number Badge */}
                  <span className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg transition-colors ${
                    isActive ? "bg-white text-blue-600" : "bg-blue-100 text-blue-600"
                  }`}>
                    {index + 1}
                  </span>
                  {/* Bullet Label */}
                  <span className="text-xl font-bold tracking-wide">{bullet.main}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Column: Image Display */}
        <div className="flex flex-col gap-4">
          <div className="relative aspect-[4/3] rounded-[2rem] overflow-hidden shadow-2xl border-[12px] border-white bg-white group">
            <img
               src={data.image}
              
              alt={data.title}
              className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
