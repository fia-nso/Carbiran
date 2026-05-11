import { supabase } from "@/supabaseClient";

// ---------------------------------------------------------------------------
// Primitive — insère une notification pour un user précis
// ---------------------------------------------------------------------------

export async function createNotification(
  userId: string,
  message: string,
  type: string,
  demandeId?: string
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    message,
    type,
    demande_id: demandeId ?? null,
  });
  if (error) console.error("createNotification:", error.message);
}

// ---------------------------------------------------------------------------
// Lookup helpers — utilisent des fonctions SECURITY DEFINER pour contourner
// la RLS sur profiles (seul l'Admin peut lire tous les profils normalement).
// Requiert get_user_ids_by_role et get_user_ids_by_role_dept dans Supabase.
// ---------------------------------------------------------------------------

async function fetchUserIdsByRole(role: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_user_ids_by_role", { p_role: role });
  if (error) { console.error("fetchUserIdsByRole:", error.message); return []; }
  return (data as string[]) ?? [];
}

async function fetchUserIdsByRoleAndDept(role: string, dept: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_user_ids_by_role_dept", {
    p_role: role,
    p_dept: dept,
  });
  if (error) { console.error("fetchUserIdsByRoleAndDept:", error.message); return []; }
  return (data as string[]) ?? [];
}

// ---------------------------------------------------------------------------
// Diffusion par rôle
// ---------------------------------------------------------------------------

export async function notifyByRole(
  role: string,
  message: string,
  type: string,
  demandeId?: string
): Promise<void> {
  const ids = await fetchUserIdsByRole(role);
  await Promise.all(ids.map((id) => createNotification(id, message, type, demandeId)));
}

export async function notifyByRoleAndDept(
  role: string,
  dept: string,
  message: string,
  type: string,
  demandeId?: string
): Promise<void> {
  const ids = await fetchUserIdsByRoleAndDept(role, dept);
  await Promise.all(ids.map((id) => createNotification(id, message, type, demandeId)));
}

// Diffusion vers plusieurs rôles simultanément (déduplique les destinataires)
export async function notifyByRoles(
  roles: string[],
  message: string,
  type: string,
  demandeId?: string
): Promise<void> {
  const idArrays = await Promise.all(roles.map(fetchUserIdsByRole));
  const allIds = [...new Set(idArrays.flat())];
  await Promise.all(allIds.map((id) => createNotification(id, message, type, demandeId)));
}
