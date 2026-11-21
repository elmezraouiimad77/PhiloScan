import React from 'react';

interface PhiloScanLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
  layout?: 'horizontal' | 'vertical';
  theme?: 'dark' | 'light' | 'vibrant' | 'glowing';
  svgStyle?: React.CSSProperties;
  svgClassName?: string;
  pathStyle?: React.CSSProperties;
  pathClassName?: string;
}

export default function PhiloScanLogo({
  className = '',
  size = 48,
  showText = false,
  layout = 'horizontal',
  theme = 'light',
  svgStyle,
  svgClassName = '',
  pathStyle,
  pathClassName = '',
}: PhiloScanLogoProps) {
  // Convert standard size to numbers for scaling
  const numericSize = typeof size === 'number' ? size : parseInt(size.toString(), 10) || 48;

  const isDark = theme === 'dark';
  const isVibrant = theme === 'vibrant' || theme === 'glowing';

  // Render the monogram
  const renderMonogram = () => (
    <div
      className={`relative flex items-center justify-center shrink-0 ${className} transition-transform duration-300 hover:scale-[1.02]`}
      style={{ width: numericSize, height: numericSize }}
    >
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`w-full h-full select-none transition-all duration-300 hover:scale-105 ${svgClassName}`}
        style={svgStyle}
      >
        <defs>
          {/* Elegant royal dark blue to navy gradient for the letter P */}
          <linearGradient id="pGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            {isVibrant ? (
              <>
                <stop offset="0%" stopColor="#2563EB" />
                <stop offset="50%" stopColor="#4F46E5" />
                <stop offset="100%" stopColor="#00F2FE" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#0B2545" />
                <stop offset="50%" stopColor="#134074" />
                <stop offset="100%" stopColor="#081A30" />
              </>
            )}
          </linearGradient>

          {/* Glowing AI Turquoise to Sky Blue gradient */}
          <linearGradient id="aiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00F2FE" />
            <stop offset="100%" stopColor="#4FACFE" />
          </linearGradient>

          {/* Premium soft gray/white for light mode, light blue-gray for dark mode inside lens */}
          <linearGradient id="lensGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            {isVibrant ? (
              <>
                <stop offset="0%" stopColor="#0F172A" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#1E293B" stopOpacity="0.75" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor={isDark ? "#1E293B" : "#F8FAFC"} stopOpacity="0.85" />
                <stop offset="100%" stopColor={isDark ? "#0F172A" : "#F1F5F9"} stopOpacity="0.95" />
              </>
            )}
          </linearGradient>

          {/* Subtle soft glow filter */}
          <filter id="aiGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* 1. STYLIZED 'P' CHARACTER WITH INTEGRATED HUMAN PROFILE (DARK BLUE) */}
        {/* Unified sleek node curve forming the stem, top curves, face silhouette features and base footing */}
        <path
          d="M 55,168 
             C 55,168 64,168 68,162 
             V 60
             C 68,60 60,60 55,60 
             H 55
             C 55,60 75,44 115,44 
             C 142,44 162,58 158,82 
             C 156,92 148,97 144,101 
             C 148,103 151,107 147,112 
             C 143,116 145,121 147,125 
             C 149,128 145,133 138,137 
             C 129,141 120,143 114,143 
             H 100 
             V 162 
             C 104,168 113,168 113,168
             H 55 Z"
          fill="url(#pGrad)"
          className={`transition-all duration-300 ${pathClassName}`}
          style={pathStyle}
        />

        {/* 2. THE MAGNIFYING GLASS SCAN LENS (AI GRADIENT GLOW) */}
        {/* The magnifier highlights the diagnostic capability ("Scan") */}
        {/* Rounded heavy handle at bottom left */}
        <path
          d="M 94,124 L 74,147"
          stroke="url(#aiGrad)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        
        {/* Lens circle housing the neural controller */}
        <circle
          cx="116"
          cy="94"
          r="28"
          fill="url(#lensGrad)"
          stroke="url(#aiGrad)"
          strokeWidth="4"
          filter="url(#aiGlow)"
          className="shadow-inner"
        />

        {/* 3. COGNITIVE NEURAL BRAIN ART (TEAL & BLUE WIREFRAME) */}
        {/* High-tech brain circuitry mapping thought processes */}
        <g stroke="url(#aiGrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
          {/* Symmetrical / Elegant neural pathways */}
          {/* Left Hemisphere */}
          <path d="M 112,80 
                   C 104,80 98,87 98,94 
                   C 98,100 102,105 110,105" />
          <path d="M 112,88 
                   C 108,88 105,91 105,94 
                   C 105,97 108,100 112,100" />
          <path d="M 112,94 H 102" />

          {/* Right Hemisphere */}
          <path d="M 120,80 
                   C 128,80 134,87 134,94 
                   C 134,100 130,105 122,105" />
          <path d="M 120,88 
                   C 124,88 127,91 127,94 
                   C 127,97 124,100 120,100" />
          <path d="M 120,94 H 130" />

          {/* Stem & Central Synaptic link */}
          <path d="M 116,77 V 111" strokeWidth="2" />
        </g>

        {/* Brain node core beacons / Micro-dots of Light */}
        <circle cx="116" cy="80" r="2.2" fill="#FFFFFF" stroke="#00F2FE" strokeWidth="0.8" />
        <circle cx="116" cy="106" r="2.2" fill="#FFFFFF" stroke="#00F2FE" strokeWidth="0.8" />
        
        <circle cx="98" cy="94" r="1.8" fill="#FFFFFF" stroke="#4FACFE" strokeWidth="0.8" />
        <circle cx="134" cy="94" r="1.8" fill="#FFFFFF" stroke="#4FACFE" strokeWidth="0.8" />
        
        <circle cx="105" cy="94" r="1.5" fill="#4FACFE" />
        <circle cx="127" cy="94" r="1.5" fill="#4FACFE" />

        {/* 4. DISPERSED DATA PIXELS / EDUCATION AI BLOCKS (CYAN & LENS BLUE) */}
        {/* Floating tech cubes that convey digital migration & dynamic learning */}
        <rect x="156" y="66" width="6" height="6" rx="1.5" fill="#00F2FE" opacity="0.9" />
        <rect x="168" y="58" width="7" height="7" rx="1.5" fill="#4FACFE" opacity="0.8" />
        <rect x="164" y="74" width="5" height="5" rx="1.2" fill="#0EA5E9" opacity="0.75" />
        <rect x="176" y="70" width="6" height="6" rx="1.5" fill="#00F2FE" opacity="0.95" />
        <rect x="154" y="85" width="8" height="8" rx="2" fill="#134074" opacity="0.85" />
        <rect x="162" y="93" width="5" height="5" rx="1" fill="#38BDF8" opacity="0.9" />
        <rect x="172" y="90" width="4" height="4" rx="1" fill="#4FACFE" opacity="0.7" />
        <rect x="155" y="108" width="6" height="6" rx="1.5" fill="#00F2FE" opacity="0.8" />
      </svg>
    </div>
  );

  if (!showText) {
    return renderMonogram();
  }

  // Combined Layout with Brand Typography & Tagline
  const displayClass = layout === 'horizontal' ? 'flex flex-row items-center gap-5' : 'flex flex-col items-center text-center gap-4';

  return (
    <div className={`font-sans ${displayClass} ${className} transition-transform duration-300 hover:scale-[1.02]`} id="philoscan-brand-lockup">
      {renderMonogram()}
      
      <div className={`flex flex-col ${layout === 'horizontal' ? 'text-right' : 'items-center'}`}>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-black tracking-tight font-sans ${isDark || isVibrant ? 'text-white' : 'text-slate-900'}`}>
            Philo<span className="text-[#38BDF8]">Scan</span>
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-[#38BDF8]/10 text-[#38BDF8] font-bold">
            SaaS
          </span>
        </div>
        
        {/* Arabic Brand Identity */}
        <p className={`text-sm font-black mt-1 flex items-center gap-1.5 ${isDark || isVibrant ? 'text-slate-200' : 'text-slate-800'}`} dir="rtl">
          <span className="text-[#38BDF8]">فيلوسكان</span>
          <span className="text-[10px] text-slate-400 font-normal">|</span>
          <span className="text-[11px] text-slate-500 font-bold tracking-wide">من تشخيص التمثلات إلى بناء التعلمات</span>
        </p>
      </div>
    </div>
  );
}
