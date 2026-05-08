export type AppRole =
  | "Admin"
  | "MENAGER"
  | "viewer"
  | "chef_de_cours"
  | "chef_departement"
  | "responsable_station";

export interface User {
  id: string;
  email: string | null;
  nom?: string | null;
  prenom?: string | null;
  role: AppRole;
  departement?: string | null;
}

// --- Workflow ravitaillement ---

export type StatutDemande =
  | "en_attente"
  | "validee_dept"
  | "validee_station"
  | "validee_cellule"
  | "annulee";

export type StatutVehicule = "en_attente" | "ravitaille" | "valide" | "refuse";

export type TypePhoto = "vehicule_avant" | "vehicule_apres" | "pompe";

export interface DemandeRavitaillement {
  id: string;
  departement: string;
  statut: StatutDemande;
  created_by: string;
  created_at: string;
  updated_at: string;
  demande_vehicules?: DemandeVehicule[];
  creator?: { email: string; full_name: string };
}

export interface DemandeVehicule {
  id: string;
  demande_id: string;
  vehicule_id: number;
  montant?: number;
  n_liter?: number;
  kilometrage?: number;
  statut: StatutVehicule;
  vehicule?: Vehicule;
  photos?: PhotoJustification[];
}

export interface PhotoJustification {
  id: string;
  demande_vehicule_id: string;
  url: string;
  type: TypePhoto;
  uploaded_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  type: string;
  lu: boolean;
  demande_id: string;
  created_at: string;
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
