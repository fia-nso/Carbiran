import type { User } from "@/types";

type RoleUser = Pick<User, "role" | "circuit_role"> | null | undefined;

export const isCellule = (user: RoleUser) => user?.role === "Admin" || user?.role === "MENAGER";

export const isDG = (user: RoleUser) =>
  user?.role === "signataire" && user?.circuit_role === "directeur_general";

export const isDT = (user: RoleUser) =>
  user?.role === "signataire" && user?.circuit_role === "directeur_technique";

/** Direction des Moyens Généraux : lecture seule Dashboard / Véhicules / Ravitaillements. */
export const isDMG = (user: RoleUser) => user?.role === "dmg";

/** Utilisateurs qui consultent Véhicules / Ravitaillements sans pouvoir rien modifier. */
export const isReadOnlyUser = (user: RoleUser) =>
  user?.role === "viewer" || isDG(user) || isDT(user) || isDMG(user);

/** Page d'accueil selon le rôle (DMG n'a pas accès aux demandes). */
export const homePathFor = (user: RoleUser) => (isDMG(user) ? "/dashboard" : "/demandes");
