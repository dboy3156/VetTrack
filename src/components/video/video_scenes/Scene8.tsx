import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const displayFont = "'Plus Jakarta Sans', sans-serif";

export function Scene8() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-slate-900/50"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-[42vw] aspect-[9/19] bg-slate-900 rounded-[3rem] border-8 border-slate-800 overflow-hidden relative shadow-2xl p-6 flex flex-col items-center">
        <div className="mt-8 text-center">
          <motion.div
            className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-900/50"
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
          >
            <span className="text-white font-black text-2xl" style={{ fontFamily: displayFont }}>V</span>
          </motion.div>
          <motion.h1
            className="text-2xl font-black text-white mb-8"
            style={{ fontFamily: displayFont }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            VetTrack
          </motion.h1>
        </div>

        <div className="w-full grid grid-cols-2 gap-4">
          {[
            { value: "124", label: "Total Items", color: "text-teal-400" },
            { value: "118", label: "Available", color: "text-emerald-400" },
            { value: "6", label: "In Use", color: "text-blue-400" },
            { value: "0", label: "Issues", color: "text-red-400" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              className="bg-slate-800 p-5 rounded-2xl text-center"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.45, ease: "easeOut" }}
            >
              <span className={`text-4xl font-black block mb-1 ${stat.color}`} style={{ fontFamily: displayFont }}>{stat.value}</span>
              <span className="text-xs text-slate-400">{stat.label}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <motion.div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm z-30"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.6 }}>
        <h2
          className="text-[6vw] font-black text-white drop-shadow-[0_0_40px_rgba(13,148,136,0.9)] tracking-tight"
          style={{ fontFamily: displayFont, letterSpacing: "-0.03em" }}
        >
          "Nothing gets lost."
        </h2>
      </motion.div>
    </motion.div>
  );
}
