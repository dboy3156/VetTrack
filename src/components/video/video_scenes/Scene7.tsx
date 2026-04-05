import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

const displayFont = "'Plus Jakarta Sans', sans-serif";

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1500),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 7000),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, x: "-8%" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-[42vw] aspect-[9/19] bg-slate-900 rounded-[3rem] border-8 border-slate-800 overflow-hidden relative shadow-2xl p-6">
        <h1 className="text-3xl font-bold mb-5" style={{ fontFamily: displayFont }}>My Equipment</h1>

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {phase < 3 && (
              <motion.div
                key="iv-pump"
                exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, overflow: "hidden" }}
                transition={{ duration: 0.5 }}
                className="bg-teal-900/20 border border-teal-500/30 p-5 rounded-2xl flex justify-between items-center"
              >
                <div>
                  <h3 className="text-lg font-bold text-white mb-1" style={{ fontFamily: displayFont }}>IV Pump #3</h3>
                  <div className="flex gap-2 text-xs text-slate-400">
                    <span className="bg-slate-800 px-2 py-0.5 rounded">ICU</span>
                  </div>
                </div>
                <div className="relative border border-slate-600 px-3 py-1.5 rounded-lg font-bold text-slate-300 text-xs" style={{ fontFamily: displayFont }}>
                  {phase === 2 ? "..." : "Return"}
                  {phase === 1 && (
                    <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-14 border-2 border-orange-400 rounded-full"
                      initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.5 }} />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-teal-900/20 border border-teal-500/30 p-5 rounded-2xl flex justify-between items-center">
            <div>
              <h3 className="text-lg font-bold text-white mb-1" style={{ fontFamily: displayFont }}>Cardiac Monitor</h3>
              <div className="flex gap-2 text-xs text-slate-400">
                <span className="bg-slate-800 px-2 py-0.5 rounded">ICU</span>
              </div>
            </div>
            <div className="border border-slate-600 px-3 py-1.5 rounded-lg font-bold text-slate-300 text-xs" style={{ fontFamily: displayFont }}>Return</div>
          </div>
        </div>

        {phase >= 3 && (
          <motion.div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-emerald-700 text-white px-6 py-3 rounded-full font-medium whitespace-nowrap shadow-xl text-sm"
            style={{ fontFamily: displayFont }}
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}>
            Returned &mdash; equipment is now available
          </motion.div>
        )}
      </div>

      <motion.div className="absolute bottom-[10%] w-full text-center z-30"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.6 }}>
        <h2
          className="text-[4vw] font-black text-white drop-shadow-2xl px-8 py-4 bg-slate-900/80 backdrop-blur-md rounded-3xl inline-block border border-white/10"
          style={{ fontFamily: displayFont, letterSpacing: "-0.02em" }}
        >
          "Everything goes back"
        </h2>
      </motion.div>
    </motion.div>
  );
}
