import pool from '../config/database'
import type { QueryResult } from 'pg'

export const createPhoto = (
  demandeVehiculeId: string,
  url: string,
  type: string
): Promise<QueryResult> =>
  pool.query(
    `INSERT INTO photos_justification (demande_vehicule_id, url, type)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [demandeVehiculeId, url, type]
  )
