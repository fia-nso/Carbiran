import { useEffect, useRef } from "react";

const POLL_MS = 30_000;

interface Options {
  onDemandesChange?: () => void;
  onDvChange?: () => void;
  onRavitaillementChange?: () => void;
  onPhotosChange?: () => void;
  showWebNotification?: (title: string, body: string, onClick?: () => void) => void;
}

export function useRealtimeSync(options: Options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const tick = () => {
      optionsRef.current.onDemandesChange?.();
      optionsRef.current.onDvChange?.();
      optionsRef.current.onRavitaillementChange?.();
      optionsRef.current.onPhotosChange?.();
    };

    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, []);
}
