import { useEffect, useRef } from "react";

interface Options {
  onDemandesChange?: () => void;
  onDvChange?: () => void;
  onRavitaillementChange?: () => void;
  onPhotosChange?: () => void;
  interval?: number;
}

export function useRealtimeSync(options: Options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const isFetchingRef = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;
      try {
        await optionsRef.current.onDemandesChange?.();
        await optionsRef.current.onDvChange?.();
        await optionsRef.current.onRavitaillementChange?.();
        await optionsRef.current.onPhotosChange?.();
      } finally {
        isFetchingRef.current = false;
      }
    };

    const ms = options.interval ?? 30_000;
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
