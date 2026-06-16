import pool from '../config/database'
import type { QueryResult, Pool, PoolClient } from 'pg'

type Db = Pool | PoolClient

export const findDemandes = (clause: string, params: unknown[]): Promise<QueryResult> =>
  pool.query(
    `SELECT
       d.id, d.departement, d.statut, d.situation_soumise,
       d.created_by, d.created_at, d.updated_at,
       u.email                        AS creator_email,
       CONCAT(u.nom, ' ', u.prenom)  AS creator_full_name,
       COALESCE(
         json_agg(
           json_build_object(
             'id',          dv.id,
             'demande_id',  dv.demande_id,
             'vehicule_id', dv.vehicule_id,
             'montant',     dv.montant,
             'n_liter',     dv.n_liter,
             'kilometrage', dv.kilometrage,
             'statut',      dv.statut
           ) ORDER BY dv.created_at
         ) FILTER (WHERE dv.id IS NOT NULL),
         '[]'
       ) AS demande_vehicules
     FROM demandes_ravitaillement d
     LEFT JOIN users u ON u.id = d.created_by
     LEFT JOIN demande_vehicules dv ON dv.demande_id = d.id
     WHERE ${clause}
     GROUP BY d.id, u.email, u.nom, u.prenom
     ORDER BY d.created_at DESC`,
    params
  )

export const findDemandeHeader = (
  clause: string,
  params: unknown[],
  id: string
): Promise<QueryResult> =>
  pool.query(
    `SELECT d.id, d.departement, d.statut, d.situation_soumise,
            d.created_by, d.created_at, d.updated_at,
            u.email AS creator_email, CONCAT(u.nom, ' ', u.prenom) AS creator_full_name
     FROM demandes_ravitaillement d
     LEFT JOIN users u ON u.id = d.created_by
     WHERE (${clause}) AND d.id = $${params.length + 1}`,
    [...params, id]
  )

export const findDemandeVehicules = (demandeId: string): Promise<QueryResult> =>
  pool.query(
    `SELECT
       dv.id, dv.demande_id, dv.vehicule_id, dv.montant, dv.n_liter,
       dv.kilometrage, dv.statut, dv.created_at,
       json_build_object(
         'id',                     v.id,
         'vehicule',               v.vehicule,
         'matricule',              v.matricule,
         'zone',                   v.zone,
         'utilisationAffectation', v.utilisation_affectation,
         'chauffeurResponsable',   v.chauffeur_responsable,
         'centre',                 v.centre
       ) AS vehicule,
       COALESCE(
         json_agg(
           json_build_object(
             'id',                  p.id,
             'demande_vehicule_id', p.demande_vehicule_id,
             'url',                 p.url,
             'type',                p.type,
             'uploaded_at',         p.uploaded_at
           ) ORDER BY p.uploaded_at
         ) FILTER (WHERE p.id IS NOT NULL),
         '[]'
       ) AS photos
     FROM demande_vehicules dv
     JOIN vehicules v ON v.id = dv.vehicule_id
     LEFT JOIN photos_justification p ON p.demande_vehicule_id = dv.id
     WHERE dv.demande_id = $1
     GROUP BY dv.id, v.id
     ORDER BY dv.created_at`,
    [demandeId]
  )

export const findDemandeRaw = (id: string): Promise<QueryResult> =>
  pool.query(
    'SELECT statut, departement, created_by FROM demandes_ravitaillement WHERE id = $1',
    [id]
  )

export const createDemande = (
  db: Db,
  departement: string,
  statut: string,
  createdBy: string
): Promise<QueryResult> =>
  db.query(
    `INSERT INTO demandes_ravitaillement (departement, statut, created_by)
     VALUES ($1, $2, $3) RETURNING id`,
    [departement, statut, createdBy]
  )

export const insertDemandeVehicules = (
  db: Db,
  demandeId: string,
  vehiculeIds: number[]
): Promise<QueryResult> => {
  const vals = vehiculeIds.map((_, i) => `($1, $${i + 2}, 'en_attente')`).join(', ')
  return db.query(
    `INSERT INTO demande_vehicules (demande_id, vehicule_id, statut) VALUES ${vals}`,
    [demandeId, ...vehiculeIds]
  )
}

export const updateDemande = (
  id: string,
  fields: Record<string, unknown>
): Promise<QueryResult> => {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [col, val] of Object.entries(fields)) {
    params.push(val)
    sets.push(`${col} = $${params.length}`)
  }
  params.push(id)
  return pool.query(
    `UPDATE demandes_ravitaillement SET ${sets.join(', ')}
     WHERE id = $${params.length}
     RETURNING *`,
    params
  )
}

export const setDemandeAnnulee = (id: string): Promise<QueryResult> =>
  pool.query(
    "UPDATE demandes_ravitaillement SET statut = 'annulee' WHERE id = $1",
    [id]
  )

export const findBon = (dvId: string): Promise<QueryResult> =>
  pool.query(
    `SELECT
       dv.id, dv.demande_id, dv.montant, dv.n_liter, dv.statut,
       v.matricule, v.vehicule AS type_vehicule, v.chauffeur_responsable,
       d.departement, d.created_at AS demande_date,
       (
         SELECT json_agg(json_build_object('id', dv2.id, 'zone', v2.zone) ORDER BY v2.zone)
         FROM demande_vehicules dv2
         JOIN vehicules v2 ON v2.id = dv2.vehicule_id
         WHERE dv2.demande_id = dv.demande_id AND dv2.statut = 'valide'
       ) AS bons_sorted
     FROM demande_vehicules dv
     JOIN vehicules v ON v.id = dv.vehicule_id
     JOIN demandes_ravitaillement d ON d.id = dv.demande_id
     WHERE dv.id = $1`,
    [dvId]
  )

export const findSignaturesBon = (demandeId: string): Promise<QueryResult> =>
  pool.query(
    `SELECT ss.role, ss.signe_le, su.signature_url
     FROM signatures_situation ss
     JOIN signatures_utilisateurs su ON su.user_id = ss.user_id
     WHERE ss.demande_id = $1 AND ss.circuit = 'bons'
     ORDER BY ss.ordre`,
    [demandeId]
  )

export const deleteDemandePhotos = (db: Db, demandeId: string): Promise<QueryResult> =>
  db.query(
    `DELETE FROM photos_justification
     WHERE demande_vehicule_id IN (
       SELECT id FROM demande_vehicules WHERE demande_id = $1
     )`,
    [demandeId]
  )

export const deleteDemandeVehicules = (db: Db, demandeId: string): Promise<QueryResult> =>
  db.query('DELETE FROM demande_vehicules WHERE demande_id = $1', [demandeId])

export const findDemandeVehiculeStatuts = (db: Db, demandeId: string): Promise<QueryResult> =>
  db.query('SELECT statut FROM demande_vehicules WHERE demande_id = $1', [demandeId])

export const updateDemandeVehicule = (
  db: Db,
  dvId: string,
  demandeId: string,
  fields: Record<string, unknown>
): Promise<QueryResult> => {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [col, val] of Object.entries(fields)) {
    params.push(val)
    sets.push(`${col} = $${params.length}`)
  }
  params.push(dvId, demandeId)
  return db.query(
    `UPDATE demande_vehicules SET ${sets.join(', ')}
     WHERE id = $${params.length - 1} AND demande_id = $${params.length}
     RETURNING *`,
    params
  )
}

export const promoteDemandeToStation = (db: Db, demandeId: string): Promise<QueryResult> =>
  db.query(
    `UPDATE demandes_ravitaillement SET statut = 'validee_station'
     WHERE id = $1 AND statut IN ('validee_dept','en_attente')
     RETURNING departement`,
    [demandeId]
  )
