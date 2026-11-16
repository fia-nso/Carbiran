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

/** Chef de centre (rôle technique chef_de_cours). */
export const isChefCentre = (user: RoleUser) => user?.role === "chef_de_cours";

/** Superviseur / station de ravitaillement d'un centre. */
export const isStation = (user: RoleUser) => user?.role === "responsable_station";

/** Rôles pour lesquels un centre de rattachement est obligatoire. */
export const ROLES_AVEC_CENTRE = ["chef_de_cours", "responsable_station"] as const;
export const roleExigeCentre = (role: string | null | undefined) =>
  !!role && (ROLES_AVEC_CENTRE as readonly string[]).includes(role);

/** Page d'accueil selon le rôle (DMG n'a pas accès aux demandes). */
export const homePathFor = (user: RoleUser) => (isDMG(user) ? "/dashboard" : "/demandes");
