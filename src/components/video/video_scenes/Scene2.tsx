import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Scene2() {
  const [phase, setPhase] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 4500),
      setTimeout(() => setPhase(5), 7000),
      setTimeout(() => setPhase(6), 8000),
      setTimeout(() => setShowOverlay(true), 5000),
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
      <div className="w-[45vw] aspect-[9/19] bg-slate-900 rounded-[3rem] border-8 border-slate-800 overflow-hidden relative shadow-2xl flex flex-col">

        <div className="h-20 bg-slate-800 flex items-center px-6 justify-between shrink-0">
          <span className="text-xl font-bold">Equipment</span>
          <div className="flex gap-3">
            <div className="w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center relative">
              S
              {phase === 1 && (
                <motion.div className="absolute w-16 h-16 border-2 border-orange-500 rounded-full"
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 0.5 }}
                />
              )}
            </div>
          </div>
        </div>

        {phase >= 2 && phase < 4 && (
          <motion.div className="absolute inset-0 z-10 bg-black flex items-center justify-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="w-64 h-64 border-4 border-teal-500 rounded-2xl relative">
              <motion.div className="absolute top-0 left-0 w-full h-1 bg-teal-400 shadow-[0_0_10px_#2dd4bf]"
                animate={{ top: ["0%", "100%", "0%"] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
            </div>
            <div className="absolute bottom-20 text-white font-medium">Scanning QR...</div>
          </motion.div>
        )}

        {phase >= 4 && (
          <motion.div className="flex-1 bg-slate-900 p-6 flex flex-col gap-6"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div>
              <h1 className="text-3xl font-bold mb-2">IV Pump #3</h1>
              <span className="text-slate-400 text-lg">ICU Department</span>
            </div>

            {phase < 6 ? (
              <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-2xl p-6 text-center">
                <span className="text-emerald-400 font-bold text-xl block mb-4">Available for use</span>
                <div className="relative inline-block">
                  <div className="bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl text-lg">Check Out</div>
                  {phase === 5 && (
                    <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 border-2 border-orange-500 rounded-full"
                      initial={{ scale: 0, opacity: 1 }}
                      animate={{ scale: 1.5, opacity: 0 }}
                      transition={{ duration: 0.5 }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <motion.div className="bg-teal-900/30 border border-teal-500/30 rounded-2xl p-6 text-center"
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <span className="text-teal-400 font-bold text-xl block mb-4">Checked out by you</span>
                <div className="bg-slate-800 text-white font-bold py-3 px-8 rounded-xl text-lg border border-slate-700">Return</div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>

      <motion.div className="absolute bottom-[15%] w-full text-center z-30"
        initial={{ opacity: 0, y: 20 }}
        animate={showOverlay ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5 }}>
        <h2 className="text-[4vw] font-bold text-white drop-shadow-2xl">
          "Scan. Assign. Done."
        </h2>
      </motion.div>
    </motion.div>
  );
}
