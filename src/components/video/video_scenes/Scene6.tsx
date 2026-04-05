import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2000),
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

        <motion.div
          className="space-y-4"
          animate={{ y: phase >= 1 ? -60 : 0 }}
          transition={{ duration: 3, ease: "linear" }}
        >
          <div className="bg-teal-900/20 border border-teal-500/30 p-5 rounded-2xl flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">IV Pump #3</h3>
              <div className="flex gap-2 text-sm text-slate-400">
                <span className="bg-slate-800 px-2 py-0.5 rounded">ICU</span>
                <span>• Checked out 45m ago</span>
              </div>
            </div>
            <div className="border border-slate-600 px-4 py-2 rounded-lg font-bold text-slate-300 text-sm">Return</div>
          </div>

          <div className="bg-teal-900/20 border border-teal-500/30 p-5 rounded-2xl flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Cardiac Monitor</h3>
              <div className="flex gap-2 text-sm text-slate-400">
                <span className="bg-slate-800 px-2 py-0.5 rounded">ICU</span>
                <span>• Checked out 2h ago</span>
              </div>
            </div>
            <div className="border border-slate-600 px-4 py-2 rounded-lg font-bold text-slate-300 text-sm">Return</div>
          </div>
        </motion.div>
      </div>

      <motion.div className="absolute top-[15%] w-full text-center z-30"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}>
        <h2 className="text-[3.5vw] font-bold text-white drop-shadow-2xl px-8 py-4 bg-slate-900/80 backdrop-blur-md rounded-3xl inline-block border border-white/10">
          "Full accountability per shift"
        </h2>
      </motion.div>
    </motion.div>
  );
}
