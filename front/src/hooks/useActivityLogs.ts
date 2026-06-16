import { useEffect, useState } from "react";
import { apiGetLogs } from "@/lib/api";
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

function mapRow(row: ActivityLogRow): ActivityLog {
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
      const data = await apiGetLogs();
      setLogs(((data as ActivityLogRow[]) ?? []).map(mapRow));
    } catch (err: any) {
      console.error("Erreur chargement logs:", err);
      setError(err?.response?.data?.error ?? err?.message ?? "Erreur chargement logs.");
    } finally {
      setLoading(false);
    }
  }

  return { logs, loading, error, reload: loadLogs };
}
