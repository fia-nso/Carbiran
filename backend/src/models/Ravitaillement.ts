import pool from '../config/database'
import type { QueryResult } from 'pg'

export const findAllRavitaillements = (): Promise<QueryResult> =>
  pool.query(
    `SELECT
       r.id, r.date, r.vehicule_id, r.montant_ravitaille, r.commentaire,
       r.kilometrage, r.n_liter, r.created_at, r.updated_at,
       json_build_object(
         'id',                     v.id,
         'vehicule',               v.vehicule,
         'matricule',              v.matricule,
         'zone',                   v.zone,
         'utilisationAffectation', v.utilisation_affectation,
         'chauffeurResponsable',   v.chauffeur_responsable,
         'centre',                 v.centre
       ) AS vehicule
     FROM ravitaillements_vehicules r
     JOIN vehicules v ON v.id = r.vehicule_id
     ORDER BY r.date DESC, r.created_at DESC`
  )

export const findRavitaillementById = (id: string): Promise<QueryResult> =>
  pool.query(
    `SELECT r.*, json_build_object(
       'vehicule', v.vehicule, 'matricule', v.matricule, 'zone', v.zone
     ) AS vehicule
     FROM ravitaillements_vehicules r
     JOIN vehicules v ON v.id = r.vehicule_id
     WHERE r.id = $1`,
    [id]
  )

export const createRavitaillement = (
  date: string,
  vehicule_id: number,
  montant_ravitaille: number,
  commentaire: string,
  kilometrage: number,
  n_liter: number
): Promise<QueryResult> =>
  pool.query(
    `INSERT INTO ravitaillements_vehicules
       (date, vehicule_id, montant_ravitaille, commentaire, kilometrage, n_liter)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [date, vehicule_id, montant_ravitaille, commentaire, kilometrage, n_liter]
  )

export const updateRavitaillement = (
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
    `UPDATE ravitaillements_vehicules SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
}

export const deleteRavitaillement = (id: string): Promise<QueryResult> =>
  pool.query('DELETE FROM ravitaillements_vehicules WHERE id = $1', [id])
