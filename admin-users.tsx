import { useEffect, useRef, useState } from "react";

interface Options {
  onRefresh: () => Promise<void>;
  threshold?: number;
}

export function usePullToRefresh({ onRefresh, threshold = 80 }: Options) {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const pullDistance = useRef(0);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY.current === 0) return;
      pullDistance.current = e.touches[0].clientY - startY.current;
      if (pullDistance.current > 0 && window.scrollY === 0) {
        setIsPulling(true);
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance.current > threshold && !isRefreshing) {
        setIsRefreshing(true);
        setIsPulling(false);
        await onRefresh();
        setIsRefreshing(false);
      }
      startY.current = 0;
      pullDistance.current = 0;
      setIsPulling(false);
    };

    document.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onRefresh, threshold, isRefreshing]);

  return { isPulling, isRefreshing };
}
