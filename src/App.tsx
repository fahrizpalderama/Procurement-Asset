import React, { useState, useEffect } from "react";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";
import axios from "axios";
import { Moon, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [authStatus, setAuthStatus] = useState<{ isAuthenticated: boolean } | null>(null);
  const [isAsleep, setIsAsleep] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await axios.get("/api/auth/status", { withCredentials: true });
        setAuthStatus(data);
      } catch (error) {
        setAuthStatus({ isAuthenticated: false });
      }
    };
    checkAuth();
  }, []);

  // --- INACTIVITY / SLEEP DETECTOR LOGIC (10 MINUTES) ---
  useEffect(() => {
    if (!authStatus?.isAuthenticated) return;
    if (isAsleep) return; // Stop tracking during sleep so simple cursor movements don't close the modal

    let timeoutId: NodeJS.Timeout;
    const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

    const handleSleep = () => {
      setIsAsleep(true);
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleSleep, INACTIVITY_LIMIT);
    };

    // Events to track user activity when awake
    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    
    // Set initial timer
    resetTimer();

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, resetTimer);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        document.removeEventListener(event, resetTimer);
      });
    };
  }, [authStatus?.isAuthenticated, isAsleep]);

  if (authStatus === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white font-sans overflow-hidden relative">
        {/* Background watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02]">
          <span className="text-[30vw] font-black uppercase tracking-tighter leading-none">
            CORE
          </span>
        </div>
        
        <div className="flex flex-col items-center gap-6 relative z-10">
          <div className="w-12 h-1 bg-black animate-pulse" />
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.6em] text-zinc-300 ml-[0.6em]">Initializing Engine</p>
            <p className="text-sm font-black uppercase tracking-tighter text-black">MENGHUBUNGKAN CLOUD...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {authStatus.isAuthenticated ? <Dashboard authStatus={authStatus} /> : <Login />}

      <AnimatePresence>
        {isAsleep && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-6 bg-black/85 backdrop-blur-xl">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-white w-full max-w-sm rounded-[40px] p-10 text-center shadow-2xl relative border border-zinc-100/10 overflow-hidden"
            >
              <div className="absolute inset-0 bg-linear-to-b from-indigo-50/20 to-transparent pointer-events-none" />
              
              <div className="relative mb-8">
                {/* Sleeping Moon Container */}
                <div className="w-24 h-24 bg-zinc-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto relative animate-pulse">
                  <Moon className="w-12 h-12 stroke-[1.5]" />
                  <motion.div
                    animate={{ 
                      scale: [1, 1.2, 1],
                      opacity: [0.3, 1, 0.3]
                    }}
                    transition={{ 
                      repeat: Infinity, 
                      duration: 3,
                      ease: "easeInOut"
                    }}
                    className="absolute top-2 right-2 text-indigo-400"
                  >
                    <Sparkles className="w-5 h-5" />
                  </motion.div>
                </div>
              </div>

              <h3 className="text-3xl font-display font-black tracking-tight mb-3 text-zinc-900 leading-none">Aplikasi Tidur</h3>
              <p className="text-xs text-zinc-400 font-bold leading-relaxed mb-8 max-w-[240px] mx-auto">
                Aplikasi ini dijeda sementara karena tidak ada aktivitas untuk mencegah refresh otomatis.
              </p>

              <button 
                onClick={() => setIsAsleep(false)}
                className="w-full bg-black text-white font-display font-black py-5 rounded-[24px] text-sm hover:bg-zinc-800 transition-all shadow-xl shadow-black/20 uppercase tracking-widest cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              >
                Kembali ke Halaman
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

