import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 3500),
      setTimeout(() => setPhase(3), 4500),
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
      <div className="w-[45vw] aspect-[9/19] bg-slate-900 rounded-[3rem] border-8 border-slate-800 overflow-hidden relative shadow-2xl flex flex-col p-6">
        <h1 className="text-3xl font-bold mb-6">Alerts</h1>

        <div className="mb-4">
          <span className="text-red-400 font-bold tracking-wider text-sm">CRITICAL</span>
        </div>

        <motion.div className="bg-red-900/20 border border-red-500/30 rounded-2xl overflow-hidden"
          initial={{ x: "100%", opacity: 0 }}
          animate={phase >= 1 ? { x: 0, opacity: 1 } : { x: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 20 }}>
          <div className="p-5 border-b border-red-500/20">
            <div className="flex justify-between items-start">
              <h3 className="font-bold text-xl text-white">Monitor #2</h3>
              <span className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-xs font-bold">Active Issue</span>
            </div>
            <p className="text-slate-300 mt-2">Screen flickering — needs service</p>
            <p className="text-slate-500 text-sm mt-1">2 mins ago • Room 4</p>
          </div>

          <div className="bg-slate-800/50 p-4">
            {phase < 3 ? (
              <div className="relative text-center text-blue-400 font-bold py-2">
                I'm handling this
                {phase === 2 && (
                  <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-16 border-2 border-orange-500 rounded-full"
                    initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.5 }} />
                )}
              </div>
            ) : (
              <motion.div className="text-center text-emerald-400 font-bold py-2 bg-emerald-900/30 rounded-lg"
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                Handling: you@clinic.com
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      <motion.div className="absolute top-[10%] w-full text-center z-30"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}>
        <h2 className="text-[3vw] font-bold text-white drop-shadow-2xl px-8 py-4 bg-slate-900/80 backdrop-blur-md rounded-3xl inline-block border border-white/10">
          "No missed problems. No duplicates."
        </h2>
      </motion.div>
    </motion.div>
  );
}
