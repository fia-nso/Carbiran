import pool from '../config/database'
import type { QueryResult } from 'pg'

const SELECT_COLS = `id, vehicule, matricule, utilisation_affectation,
                     chauffeur_responsable, zone, centre, created_at, updated_at`

export const findAllVehicules = (): Promise<QueryResult> =>
  pool.query(`SELECT ${SELECT_COLS} FROM vehicules ORDER BY zone, vehicule`)

export const findVehiculeById = (id: string): Promise<QueryResult> =>
  pool.query(`SELECT ${SELECT_COLS} FROM vehicules WHERE id = $1`, [id])

export const createVehicule = (
  vehicule: string,
  matricule: string,
  utilisation_affectation: string,
  chauffeur_responsable: string | null,
  zone: string,
  centre: string | null
): Promise<QueryResult> =>
  pool.query(
    `INSERT INTO vehicules (vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [vehicule, matricule, utilisation_affectation, chauffeur_responsable, zone, centre]
  )

export const updateVehicule = (id: string, fields: Record<string, unknown>): Promise<QueryResult> => {
  const sets: string[] = []
  const params: unknown[] = []
  for (const [col, val] of Object.entries(fields)) {
    params.push(val)
    sets.push(`${col} = $${params.length}`)
  }
  params.push(id)
  return pool.query(
    `UPDATE vehicules SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  )
}

export const deleteVehicule = (id: string): Promise<QueryResult> =>
  pool.query('DELETE FROM vehicules WHERE id = $1', [id])
