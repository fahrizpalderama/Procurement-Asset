import React, { useState, useEffect } from "react";
import { 
  FileSpreadsheet, 
  ChevronRight, 
  ShieldCheck, 
  Cloud,
  RefreshCw
} from "lucide-react";
import { motion } from "motion/react";
import axios from "axios";

export default function Login() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { data } = await axios.get("/api/auth/url");
      const authWindow = window.open(data.url, "google_auth", "width=600,height=700");
      
      if (!authWindow) {
        alert("Silakan aktifkan popup untuk melanjutkan login.");
        setLoading(false);
      }
    } catch (error) {
      console.error("Auth error", error);
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        window.location.reload();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-zinc-900">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[900px] bg-white rounded-[40px] shadow-[0_32px_120px_-20px_rgba(0,0,0,0.1)] flex flex-col md:flex-row overflow-hidden border border-white"
      >
        {/* Left Side: Illustration & Branding */}
        <div className="flex-1 bg-zinc-50 p-12 flex flex-col items-center justify-center text-center relative group">
          <div className="absolute top-8 left-8 flex items-center gap-2">
            <div className="bg-black text-white p-1.5 rounded-lg">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span className="font-display font-bold tracking-tight text-sm">PROCURE.SYNC</span>
          </div>

          <div className="mb-12 relative">
            <div className="w-64 h-64 bg-white rounded-full flex items-center justify-center relative z-10 shadow-sm border border-zinc-100">
              <div className="relative">
                <Cloud className="w-24 h-24 text-zinc-100 absolute -top-4 -right-4" />
                <motion.div
                  animate={{ 
                    y: [0, -10, 0],
                  }}
                  transition={{ 
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <FileSpreadsheet className="w-32 h-32 text-black" />
                </motion.div>
                <div className="absolute -bottom-6 -left-6 bg-black text-white p-4 rounded-[20px] shadow-lg">
                  <ShieldCheck className="w-6 h-6" />
                </div>
              </div>
            </div>
            {/* Background decorative circles */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-zinc-100 rounded-full scale-0 group-hover:scale-100 transition-transform duration-1000 opacity-20" />
          </div>

          <div className="max-w-[280px]">
            <h1 className="text-3xl font-display font-bold tracking-tight mb-4">Efisiensi Pengadaan dalam Satu Genggaman</h1>
            <p className="text-sm text-zinc-400 font-medium leading-relaxed">
              Solusi cerdas sinkronisasi cloud untuk manajemen logistik perusahaan Anda.
            </p>
          </div>

          <div className="mt-12 flex gap-2">
            <div className="w-8 h-1.5 bg-black rounded-full" />
            <div className="w-2 h-1.5 bg-zinc-200 rounded-full" />
            <div className="w-2 h-1.5 bg-zinc-200 rounded-full" />
          </div>
        </div>

        {/* Right Side: Auth Form */}
        <div className="flex-1 p-12 md:p-16 flex flex-col justify-center">
          <div className="mb-12">
            <h2 className="text-4xl font-display font-bold tracking-tight mb-2">Selamat Datang</h2>
            <p className="text-zinc-400 font-medium">Silakan hubungkan akun Google Anda untuk memulai sesi aman.</p>
          </div>

          <div className="space-y-4 mb-12">
            <div className="bg-slate-50 p-5 rounded-[24px] flex items-center gap-4 border border-transparent hover:border-zinc-200 transition-all hover:bg-white">
              <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-zinc-900" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-0.5">Izin Terjamin</p>
                <p className="text-sm font-semibold">Protokol OAuth 2.0</p>
              </div>
            </div>
            <div className="bg-slate-50 p-5 rounded-[24px] flex items-center gap-4 border border-transparent hover:border-zinc-200 transition-all hover:bg-white">
              <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
                <Cloud className="w-5 h-5 text-zinc-900" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-0.5">Penyimpanan</p>
                <p className="text-sm font-semibold">Sinkronisasi Cloud Aktif</p>
              </div>
            </div>
          </div>

          <button 
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-black text-white py-5 rounded-[24px] font-display font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_20px_40px_-10px_rgba(0,0,0,0.2)] disabled:opacity-50 flex items-center justify-center gap-3 group"
          >
            {loading ? (
              <RefreshCw className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <span>Mulai Sekarang</span>
                <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>

          <footer className="mt-12 text-center">
            <p className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest">
              Developed by ProcureSync Engine v2.4
            </p>
          </footer>
        </div>
      </motion.div>
    </div>
  );
}
