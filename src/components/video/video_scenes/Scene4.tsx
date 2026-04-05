import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const displayFont = "'Plus Jakarta Sans', sans-serif";

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1500),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 6000),
      setTimeout(() => setPhase(5), 7500),
      setTimeout(() => setPhase(6), 9000),
      setTimeout(() => setPhase(7), 10000),
      setTimeout(() => setPhase(8), 11000),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: "-8%", filter: "blur(6px)" }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-[42vw] aspect-[9/19] bg-slate-900 rounded-[3rem] border-8 border-slate-800 overflow-hidden relative shadow-2xl flex flex-col">
        <div className="p-6 flex-1 relative">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-1" style={{ fontFamily: displayFont }}>Monitor #2</h1>
              <span className="text-slate-400 text-base">Room 4</span>
            </div>
            <div className="relative">
              <div className="bg-blue-600 text-white px-5 py-2 rounded-lg font-bold text-sm" style={{ fontFamily: displayFont }}>Scan</div>
              {phase === 1 && (
                <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border-2 border-orange-400 rounded-full"
                  initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.5 }}
                />
              )}
            </div>
          </div>

          <div className={`p-5 rounded-2xl transition-colors duration-500 ${phase >= 7 ? "bg-red-900/30 border border-red-500/30" : "bg-emerald-900/30 border border-emerald-500/30"}`}>
            <span className={`font-bold text-lg block ${phase >= 7 ? "text-red-400" : "text-emerald-400"}`} style={{ fontFamily: displayFont }}>
              {phase >= 7 ? "Issue Reported" : "Available for use"}
            </span>
          </div>

          {phase >= 2 && phase < 7 && (
            <motion.div className="absolute inset-0 z-50 bg-black/60 flex items-end justify-center p-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div className="bg-slate-800 w-full rounded-2xl p-5 shadow-2xl border border-slate-700"
                initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ type: "spring", damping: 25 }}>
                <h3 className="text-lg font-bold mb-4" style={{ fontFamily: displayFont }}>Update Status</h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-700 p-3 rounded-xl text-center font-bold text-sm" style={{ fontFamily: displayFont }}>Check Out</div>
                  <div className="relative bg-red-900/40 border border-red-500/50 p-3 rounded-xl text-center font-bold text-red-400 text-sm" style={{ fontFamily: displayFont }}>
                    Report Issue
                    {phase === 3 && (
                      <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-16 border-2 border-orange-400 rounded-full"
                        initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.5 }} />
                    )}
                  </div>
                </div>

                <div className="mb-4 bg-slate-900 p-3 rounded-xl border border-slate-700 h-20 text-slate-300 text-sm">
                  {phase >= 4 ? "Screen flickering — needs service" : "Add note..."}
                </div>

                <div className="relative bg-slate-700/50 p-3 rounded-xl text-center mb-4 border border-slate-600 border-dashed text-slate-400 font-medium text-sm">
                  Take / Upload Photo
                  {phase === 5 && (
                    <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-16 border-2 border-orange-400 rounded-full"
                      initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.5 }} />
                  )}
                </div>

                <div className="relative bg-teal-600 p-3 rounded-xl text-center font-bold text-white text-base" style={{ fontFamily: displayFont }}>
                  Update Status
                  {phase === 6 && (
                    <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-16 border-2 border-orange-400 rounded-full"
                      initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.5 }} />
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>

      <motion.div className="absolute bottom-[10%] w-full text-center z-30"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 8 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6 }}>
        <h2
          className="text-[3.5vw] font-black text-white drop-shadow-2xl px-8 py-4 bg-slate-900/80 backdrop-blur-md rounded-3xl inline-block border border-white/10"
          style={{ fontFamily: displayFont, letterSpacing: "-0.02em" }}
        >
          "Clear issue reporting. No guesswork."
        </h2>
      </motion.div>
    </motion.div>
  );
}
