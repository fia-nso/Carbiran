export type AppRole = "Admin" | "MENAGER" | "viewer";

export interface User {
  id: string;
  email: string | null;
  nom?: string | null;
  prenom?: string | null;
  role: AppRole;
}

export interface Vehicule {
  id: number;
  vehicule: string;
  matricule: string;
  utilisationAffectation: string;
  chauffeurResponsable?: string | null;
  zone: string;
}

export interface RavitaillementVehicule {
  id: number;
  date: string | null;
  vehiculeId: number;
  vehicule: Vehicule | null;
  montantRavitaille: number;
  commentaire: string;
  kilometrage: number;
  nLiter: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActivityLog {
  id: number;
  createdAt: string;
  userId: string | null;
  userEmail: string | null;
  module: string;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  description: string | null;
  beforeData: unknown;
  afterData: unknown;
  metadata: unknown;
}
