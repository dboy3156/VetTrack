import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const displayFont = "'Plus Jakarta Sans', sans-serif";

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2200),
    ];
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: "8%", filter: "blur(6px)" }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="w-[42vw] aspect-[9/19] bg-slate-900 rounded-[3rem] border-8 border-slate-800 overflow-hidden relative shadow-2xl p-6">
        <h1 className="text-3xl font-bold mb-5" style={{ fontFamily: displayFont }}>My Equipment</h1>

        <motion.div
          className="space-y-4"
          animate={{ y: phase >= 1 ? -50 : 0 }}
          transition={{ duration: 3, ease: "linear" }}
        >
          {[
            { name: "IV Pump #3", location: "ICU", time: "45m ago" },
            { name: "Cardiac Monitor", location: "ICU", time: "2h ago" },
            { name: "Ventilator #1", location: "OR", time: "4h ago" },
          ].map((item, i) => (
            <motion.div
              key={item.name}
              className="bg-teal-900/20 border border-teal-500/30 p-5 rounded-2xl flex justify-between items-center"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.15, duration: 0.5, ease: "easeOut" }}
            >
              <div>
                <h3 className="text-lg font-bold text-white mb-1" style={{ fontFamily: displayFont }}>{item.name}</h3>
                <div className="flex gap-2 text-xs text-slate-400">
                  <span className="bg-slate-800 px-2 py-0.5 rounded">{item.location}</span>
                  <span>&bull; Checked out {item.time}</span>
                </div>
              </div>
              <div className="border border-slate-600 px-3 py-1.5 rounded-lg font-bold text-slate-300 text-xs" style={{ fontFamily: displayFont }}>Return</div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <motion.div className="absolute top-[12%] w-full text-center z-30"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        transition={{ duration: 0.6 }}>
        <h2
          className="text-[3.5vw] font-black text-white drop-shadow-2xl px-8 py-4 bg-slate-900/80 backdrop-blur-md rounded-3xl inline-block border border-white/10"
          style={{ fontFamily: displayFont, letterSpacing: "-0.02em" }}
        >
          "Full accountability per shift"
        </h2>
      </motion.div>
    </motion.div>
  );
}
