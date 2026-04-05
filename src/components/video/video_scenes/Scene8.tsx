import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene8() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-slate-900"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      transition={{ duration: 0 }}
    >
      <div className="w-[45vw] aspect-[9/19] bg-slate-900 rounded-[3rem] border-8 border-slate-800 overflow-hidden relative shadow-2xl p-6 flex flex-col items-center">
        <div className="mt-8 text-center">
          <div className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-900/50">
            <span className="text-white font-bold text-3xl">V</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-8">VetTrack</h1>
        </div>

        <div className="w-full grid grid-cols-2 gap-4">
          <div className="bg-slate-800 p-6 rounded-2xl text-center">
            <span className="text-4xl font-bold text-teal-400 block mb-1">124</span>
            <span className="text-sm text-slate-400">Total Items</span>
          </div>
          <div className="bg-slate-800 p-6 rounded-2xl text-center">
            <span className="text-4xl font-bold text-emerald-400 block mb-1">118</span>
            <span className="text-sm text-slate-400">Available</span>
          </div>
          <div className="bg-slate-800 p-6 rounded-2xl text-center">
            <span className="text-4xl font-bold text-blue-400 block mb-1">6</span>
            <span className="text-sm text-slate-400">In Use</span>
          </div>
          <div className="bg-slate-800 p-6 rounded-2xl text-center">
            <span className="text-4xl font-bold text-red-400 block mb-1">0</span>
            <span className="text-sm text-slate-400">Issues</span>
          </div>
        </div>
      </div>

      {/* Hero overlay text — appears at 1s and holds until video fades to black */}
      <motion.div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm z-30"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}>
        <h2 className="text-[6vw] font-black text-white drop-shadow-[0_0_30px_rgba(13,148,136,0.8)] tracking-tight">
          "Nothing gets lost."
        </h2>
      </motion.div>
    </motion.div>
  );
}
