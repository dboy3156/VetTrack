import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

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
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      transition={{ duration: 0 }}
    >
      <div className="w-[45vw] aspect-[9/19] bg-slate-900 rounded-[3rem] border-8 border-slate-800 overflow-hidden relative shadow-2xl p-6">
        <h1 className="text-3xl font-bold mb-6">My Equipment</h1>

        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {phase < 3 && (
              <motion.div
                key="iv-pump"
                exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, overflow: 'hidden' }}
                transition={{ duration: 0.5 }}
                className="bg-teal-900/20 border border-teal-500/30 p-5 rounded-2xl flex justify-between items-center"
              >
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">IV Pump #3</h3>
                  <div className="flex gap-2 text-sm text-slate-400">
                    <span className="bg-slate-800 px-2 py-0.5 rounded">ICU</span>
                  </div>
                </div>
                <div className="relative border border-slate-600 px-4 py-2 rounded-lg font-bold text-slate-300 text-sm">
                  {phase === 2 ? "..." : "Return"}
                  {phase === 1 && (
                    <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-16 border-2 border-orange-500 rounded-full"
                      initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.5 }} />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-teal-900/20 border border-teal-500/30 p-5 rounded-2xl flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Cardiac Monitor</h3>
              <div className="flex gap-2 text-sm text-slate-400">
                <span className="bg-slate-800 px-2 py-0.5 rounded">ICU</span>
              </div>
            </div>
            <div className="border border-slate-600 px-4 py-2 rounded-lg font-bold text-slate-300 text-sm">Return</div>
          </div>
        </div>

        {phase >= 3 && (
          <motion.div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-emerald-800 text-white px-6 py-3 rounded-full font-medium whitespace-nowrap shadow-xl"
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}>
            Returned — equipment is now available
          </motion.div>
        )}
      </div>

      <motion.div className="absolute bottom-[10%] w-full text-center z-30"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5 }}>
        <h2 className="text-[4vw] font-bold text-white drop-shadow-2xl px-8 py-4 bg-slate-900/80 backdrop-blur-md rounded-3xl inline-block border border-white/10">
          "Everything goes back"
        </h2>
      </motion.div>
    </motion.div>
  );
}
