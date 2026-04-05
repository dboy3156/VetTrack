import { motion, AnimatePresence } from "framer-motion";
import { useVideoPlayer } from "@/lib/video";
import { Scene1 } from "./video_scenes/Scene1";
import { Scene2 } from "./video_scenes/Scene2";
import { Scene3 } from "./video_scenes/Scene3";
import { Scene4 } from "./video_scenes/Scene4";
import { Scene5 } from "./video_scenes/Scene5";
import { Scene6 } from "./video_scenes/Scene6";
import { Scene7 } from "./video_scenes/Scene7";
import { Scene8 } from "./video_scenes/Scene8";

const SCENE_DURATIONS = {
  scene1: 7000,
  scene2: 13000,
  scene3: 12000,
  scene4: 15000,
  scene5: 10000,
  scene6: 8000,
  scene7: 10000,
  scene8: 6000,
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-900 text-white font-sans">
      {/* Persistent Background Layer */}
      <div className="absolute inset-0">
        <motion.div
          className="absolute w-[800px] h-[800px] rounded-full opacity-20 blur-[100px]"
          style={{ background: "radial-gradient(circle, #0d9488, transparent)" }}
          animate={{
            x: ["-20%", "40%", "10%", "-20%"],
            y: ["10%", "-20%", "30%", "10%"],
            scale: [1, 1.2, 0.9, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full opacity-10 blur-[80px] right-0 bottom-0"
          style={{ background: "radial-gradient(circle, #0891b2, transparent)" }}
          animate={{
            x: ["10%", "-30%", "5%", "10%"],
            y: ["-10%", "-40%", "-10%", "-10%"],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Persistent Midground Accent */}
      <motion.div
        className="absolute w-20 h-20 border-[3px] border-teal-500/20 rounded-2xl"
        animate={{
          x: ["70vw", "85vw", "10vw", "50vw", "30vw", "80vw", "20vw", "50vw"][currentScene] || "50vw",
          y: ["20vh", "60vh", "30vh", "10vh", "75vh", "20vh", "60vh", "50vh"][currentScene] || "50vh",
          rotate: [0, 45, 90, 135, 180, 225, 270, 315][currentScene] || 0,
          scale: [1, 1, 1.5, 0.8, 1.2, 1, 1.3, 0.5][currentScene] || 1,
          opacity: currentScene === 7 ? 0 : 1,
        }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Persistent Logo Mark */}
      <motion.div
        className="absolute top-8 left-8 z-50 flex items-center gap-3"
        animate={{ opacity: currentScene === 7 ? 0 : 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="w-10 h-10 bg-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-teal-900/50">
          <span className="text-white font-bold text-xl">V</span>
        </div>
        <span className="text-xl font-bold tracking-tight text-white">VetTrack</span>
      </motion.div>

      {/* Foreground Scenes */}
      <AnimatePresence mode="sync">
        {currentScene === 0 && <Scene1 key="scene1" />}
        {currentScene === 1 && <Scene2 key="scene2" />}
        {currentScene === 2 && <Scene3 key="scene3" />}
        {currentScene === 3 && <Scene4 key="scene4" />}
        {currentScene === 4 && <Scene5 key="scene5" />}
        {currentScene === 5 && <Scene6 key="scene6" />}
        {currentScene === 6 && <Scene7 key="scene7" />}
        {currentScene === 7 && <Scene8 key="scene8" />}
      </AnimatePresence>

      {/* Fade-to-black overlay: only activates during Scene 8, fades in at the end */}
      <motion.div
        className="absolute inset-0 bg-black pointer-events-none z-[100]"
        animate={{ opacity: currentScene === 7 ? 1 : 0 }}
        transition={
          currentScene === 7
            ? { duration: 1, ease: "easeIn", delay: 4.5 }
            : { duration: 0 }
        }
      />
    </div>
  );
}
