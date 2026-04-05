import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const displayFont = "'Plus Jakarta Sans', sans-serif";

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 3500),
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: "-8%", filter: "blur(8px)" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="absolute top-[22%] left-1/2 -translate-x-1/2 z-20 text-center w-full px-8">
        <motion.h2
          className="text-[4.5vw] font-black text-white drop-shadow-2xl"
          style={{ fontFamily: displayFont, letterSpacing: "-0.02em" }}
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          "Where is the equipment?"
        </motion.h2>
        <motion.h2
          className="text-[3vw] font-semibold text-teal-300 mt-4 drop-shadow-2xl"
          style={{ fontFamily: displayFont }}
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          "No one knows who took it"
        </motion.h2>
      </div>

      <motion.div
        className="w-[55%] max-w-xl bg-slate-800/70 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 shadow-2xl overflow-hidden relative opacity-50 mt-24"
        initial={{ y: "60%" }}
        animate={{ y: "-15%" }}
        transition={{ duration: 15, ease: "linear" }}
      >
        <div className="space-y-4">
          {[...equipment, ...equipment].map((eq, i) => (
            <div key={i} className="bg-slate-900/80 p-5 rounded-2xl flex justify-between items-center border border-slate-700/50">
              <span className="text-xl font-semibold text-slate-200" style={{ fontFamily: displayFont }}>{eq.name}</span>
              <span className={`px-4 py-1.5 rounded-full text-xs font-bold tracking-wider ${eq.status === "ok" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                {eq.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
