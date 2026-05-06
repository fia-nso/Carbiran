import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";
import type { ActivityLog } from "@/types";

interface ActivityLogRow {
  id: number;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
  module: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  description: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: unknown;
}

function mapActivityLogRow(row: ActivityLogRow): ActivityLog {
  return {
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id,
    userEmail: row.user_email,
    module: row.module,
    action: row.action,
    targetTable: row.target_table,
    targetId: row.target_id,
    description: row.description,
    beforeData: row.before_data,
    afterData: row.after_data,
    metadata: row.metadata,
  };
}

export function useActivityLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadLogs().catch(() => undefined);
  }, []);

  async function loadLogs() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: logsError } = await supabase
        .from("activity_logs")
        .select(
          "id, created_at, user_id, user_email, module, action, target_table, target_id, description, before_data, after_data, metadata"
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

      if (logsError) {
        throw logsError;
      }

      setLogs(((data as ActivityLogRow[] | null) || []).map(mapActivityLogRow));
    } catch (caughtError: any) {
      console.error("Erreur chargement logs:", caughtError);
      setError(caughtError?.message ?? "Erreur lors du chargement des logs.");
    } finally {
      setLoading(false);
    }
  }

  return {
    logs,
    loading,
    error,
    reload: loadLogs,
  };
}
