import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 3000),
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
      <div className="w-[45vw] aspect-[9/19] bg-slate-900 rounded-[3rem] border-8 border-slate-800 overflow-hidden relative shadow-2xl">
        <motion.div
          className="p-6 flex flex-col gap-6"
          animate={{ y: phase >= 1 ? -150 : 0 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        >
          <div>
            <h1 className="text-4xl font-bold mb-2">IV Pump #3</h1>
            <span className="text-slate-400 text-xl">ICU Department</span>
          </div>

          <div className="bg-teal-900/40 border border-teal-500/40 rounded-2xl p-8 text-center shadow-lg shadow-teal-900/20">
            <span className="text-teal-300 font-bold text-2xl block mb-2">Checked out by you</span>
            <span className="text-teal-100/70 text-lg block mb-6">Since 2 mins ago</span>
            <div className="bg-slate-800/80 text-white font-bold py-4 px-8 rounded-xl text-xl border border-slate-700 inline-block w-full">Return Equipment</div>
          </div>

          <div className="mt-4">
            <div className="flex gap-8 border-b border-slate-800 pb-4 mb-6">
              <span className="text-xl text-slate-400">Details</span>
              <span className="text-xl font-bold text-teal-400 border-b-2 border-teal-400 pb-4 -mb-4">History</span>
            </div>

            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-3 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">
              <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                <div className="flex items-center justify-center w-6 h-6 rounded-full border border-white bg-slate-800 group-[.is-active]:bg-teal-500 text-slate-500 group-[.is-active]:text-teal-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10"></div>
                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-800 p-4 rounded-xl border border-slate-700">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-bold text-teal-400">Checked Out</div>
                    <time className="font-mono text-xs text-slate-500">Just now</time>
                  </div>
                  <div className="text-slate-300 text-sm">Checked out by Dr. Smith</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div className="absolute top-[15%] w-full text-center z-30"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        transition={{ duration: 0.5 }}>
        <h2 className="text-[3.5vw] font-bold text-white drop-shadow-2xl px-8 py-4 bg-slate-900/60 backdrop-blur-md rounded-3xl inline-block border border-white/10">
          "Now tracked. Fully accountable."
        </h2>
      </motion.div>
    </motion.div>
  );
}
