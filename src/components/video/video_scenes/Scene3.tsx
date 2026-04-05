import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const displayFont = "'Plus Jakarta Sans', sans-serif";

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 3200),
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
      <div className="w-[42vw] aspect-[9/19] bg-slate-900 rounded-[3rem] border-8 border-slate-800 overflow-hidden relative shadow-2xl">
        <motion.div
          className="p-6 flex flex-col gap-5"
          animate={{ y: phase >= 1 ? -140 : 0 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        >
          <div>
            <h1 className="text-4xl font-bold mb-1" style={{ fontFamily: displayFont }}>IV Pump #3</h1>
            <span className="text-slate-400 text-lg">ICU Department</span>
          </div>

          <div className="bg-teal-900/40 border border-teal-500/40 rounded-2xl p-7 text-center shadow-lg shadow-teal-900/20">
            <span className="text-teal-300 font-bold text-2xl block mb-2" style={{ fontFamily: displayFont }}>Checked out by you</span>
            <span className="text-teal-100/60 text-base block mb-5">Since 2 mins ago</span>
            <div className="bg-slate-800/80 text-white font-bold py-4 px-8 rounded-xl text-lg border border-slate-700 inline-block w-full" style={{ fontFamily: displayFont }}>Return Equipment</div>
          </div>

          <div className="mt-2">
            <div className="flex gap-8 border-b border-slate-800 pb-4 mb-5">
              <span className="text-lg text-slate-400">Details</span>
              <span className="text-lg font-bold text-teal-400 border-b-2 border-teal-400 pb-4 -mb-4">History</span>
            </div>

            <div className="space-y-5 relative before:absolute before:inset-0 before:ml-3 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">
              <div className="relative flex items-center justify-between group is-active">
                <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-teal-500 text-teal-50 shadow shrink-0 z-10"></div>
                <div className="w-[calc(100%-4rem)] bg-slate-800 p-4 rounded-xl border border-slate-700">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-bold text-teal-400" style={{ fontFamily: displayFont }}>Checked Out</div>
                    <time className="font-mono text-xs text-slate-500">Just now</time>
                  </div>
                  <div className="text-slate-300 text-sm">Checked out by Dr. Smith</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div className="absolute top-[12%] w-full text-center z-30"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        transition={{ duration: 0.6 }}>
        <h2
          className="text-[3.5vw] font-black text-white drop-shadow-2xl px-8 py-4 bg-slate-900/70 backdrop-blur-md rounded-3xl inline-block border border-white/10"
          style={{ fontFamily: displayFont, letterSpacing: "-0.02em" }}
        >
          "Now tracked. Fully accountable."
        </h2>
      </motion.div>
    </motion.div>
  );
}
