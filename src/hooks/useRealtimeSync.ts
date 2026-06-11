import { useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

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
    const channelName = `realtime-sync-${Math.random().toString(36).slice(2)}`;

    const channel = supabase
      .channel(channelName)
      // demande_vehicules → onDemandesChange + onDvChange
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "demande_vehicules" },
        (payload) => {
          optionsRef.current.onDemandesChange?.();
          optionsRef.current.onDvChange?.();
          const newRow = payload.new as { statut?: string } | undefined;
          if (newRow?.statut === "ravitaille") {
            optionsRef.current.showWebNotification?.(
              "🔔 Carbiran — Nouveau ravitaillement",
              "Un véhicule a été ravitaillé — à vérifier",
              () => window.focus()
            );
          }
        }
      )
      // demandes_ravitaillement → onDemandesChange
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "demandes_ravitaillement" },
        () => optionsRef.current.onDemandesChange?.()
      )
      // ravitaillements_vehicules → onRavitaillementChange
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ravitaillements_vehicules" },
        () => optionsRef.current.onRavitaillementChange?.()
      )
      // photos_justification → onPhotosChange
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "photos_justification" },
        () => optionsRef.current.onPhotosChange?.()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);
}
