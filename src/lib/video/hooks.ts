import { useState, useEffect, useRef } from "react";

interface UseVideoPlayerOptions {
  durations: Record<string, number>;
}

interface UseVideoPlayerResult {
  currentScene: number;
}

export function useVideoPlayer({ durations }: UseVideoPlayerOptions): UseVideoPlayerResult {
  const [currentScene, setCurrentScene] = useState(0);
  const sceneKeys = Object.keys(durations);
  const totalScenes = sceneKeys.length;
  const hasCalledStop = useRef(false);
  const loopCount = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined" && window.startRecording) {
      window.startRecording();
    }
  }, []);

  useEffect(() => {
    const sceneKey = sceneKeys[currentScene];
    const duration = durations[sceneKey];

    const timer = setTimeout(() => {
      const nextScene = (currentScene + 1) % totalScenes;

      if (nextScene === 0) {
        loopCount.current += 1;
        if (!hasCalledStop.current) {
          hasCalledStop.current = true;
          if (typeof window !== "undefined" && window.stopRecording) {
            window.stopRecording();
          }
        }
      }

      setCurrentScene(nextScene);
    }, duration);

    return () => clearTimeout(timer);
  }, [currentScene, durations, sceneKeys, totalScenes]);

  return { currentScene };
}
