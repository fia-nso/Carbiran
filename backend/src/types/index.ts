export type AppRole =
  | 'Admin'
  | 'MENAGER'
  | 'viewer'
  | 'chef_de_cours'
  | 'chef_departement'
  | 'responsable_station'
  | 'responsable_station_viewer'
  | 'signataire';

export type StatutDemande =
  | 'en_attente'
  | 'validee_dept'
  | 'validee_station'
  | 'validee_cellule'
  | 'annulee';

export type StatutVehicule = 'en_attente' | 'ravitaille' | 'valide' | 'refuse';
export type TypePhoto = 'vehicule_avant' | 'vehicule_apres' | 'pompe';

export interface JwtPayload {
  sub: string;
  email: string;
  role: AppRole;
  departement: string | null;
  circuit_role: string | null;
}

// Augmente le namespace Express pour que req.user soit disponible dans toutes les routes
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
