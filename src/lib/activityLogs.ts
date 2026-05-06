import { supabase } from "@/supabaseClient";

interface ActivityLogPayload {
  module: string;
  action: string;
  targetTable?: string | null;
  targetId?: string | number | null;
  description?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: unknown;
}

export async function writeActivityLog(payload: ActivityLogPayload) {
  const { data, error: authError } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!data.user) {
    throw new Error("Utilisateur courant introuvable pour le journal d'activite.");
  }

  const { error } = await supabase.from("activity_logs").insert([
    {
      user_id: data.user.id,
      user_email: data.user.email ?? null,
      module: payload.module,
      action: payload.action,
      target_table: payload.targetTable ?? null,
      target_id: payload.targetId !== undefined && payload.targetId !== null
        ? String(payload.targetId)
        : null,
      description: payload.description ?? null,
      before_data: payload.beforeData ?? null,
      after_data: payload.afterData ?? null,
      metadata: payload.metadata ?? null,
    },
  ]);

  if (error) {
    throw error;
  }
}

export async function writeActivityLogSafe(payload: ActivityLogPayload) {
  try {
    await writeActivityLog(payload);
  } catch (error) {
    console.error("Erreur ecriture journal activite:", error);
  }
}
