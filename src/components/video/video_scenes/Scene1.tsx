import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 4000),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  const equipment = [
    { name: "IV Pump #3", status: "ok" },
    { name: "Monitor #2", status: "issue" },
    { name: "Cardiac Monitor", status: "ok" },
    { name: "Ventilator #1", status: "ok" },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1 }}
      transition={{ duration: 0 }}
    >
      <div className="absolute top-[30%] left-1/2 -translate-x-1/2 z-20 text-center w-full">
        <motion.h2
          className="text-[4vw] font-bold text-white drop-shadow-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          "Where is the equipment?"
        </motion.h2>
        <motion.h2
          className="text-[3vw] font-medium text-teal-200 mt-4 drop-shadow-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          "No one knows who took it"
        </motion.h2>
      </div>

      <motion.div
        className="w-[60%] max-w-2xl bg-slate-800/80 backdrop-blur-xl border border-slate-700 rounded-3xl p-6 shadow-2xl overflow-hidden relative opacity-60"
        initial={{ y: "100%" }}
        animate={{ y: "-20%" }}
        transition={{ duration: 15, ease: "linear" }}
      >
        <div className="space-y-4">
          {equipment.map((eq, i) => (
            <div key={i} className="bg-slate-900/80 p-5 rounded-2xl flex justify-between items-center border border-slate-700/50">
              <span className="text-2xl font-semibold text-slate-200">{eq.name}</span>
              <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${eq.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {eq.status.toUpperCase()}
              </span>
            </div>
          ))}
          {equipment.map((eq, i) => (
            <div key={`copy-${i}`} className="bg-slate-900/80 p-5 rounded-2xl flex justify-between items-center border border-slate-700/50">
              <span className="text-2xl font-semibold text-slate-200">{eq.name}</span>
              <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${eq.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {eq.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
