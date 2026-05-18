import React, { useState, useEffect } from "react";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";
import axios from "axios";

export default function App() {
  const [authStatus, setAuthStatus] = useState<{ isAuthenticated: boolean } | null>(null);

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

  // --- AUTO LOGOUT LOGIC (10 MINUTES) ---
  useEffect(() => {
    if (!authStatus?.isAuthenticated) return;

    let timeoutId: NodeJS.Timeout;
    const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes

    const handleLogout = async () => {
      try {
        await axios.post("/api/auth/logout", {}, { withCredentials: true });
        window.location.reload(); // Hard reload to clear state and redirect to login
      } catch (err) {
        console.error("Auto-logout failed:", err);
      }
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(handleLogout, INACTIVITY_LIMIT);
    };

    // Events to track user activity
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
  }, [authStatus?.isAuthenticated]);

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

  return authStatus.isAuthenticated ? <Dashboard authStatus={authStatus} /> : <Login />;
}

