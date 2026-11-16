import { AppDataSource } from '../config/database'
import { User } from '../entities/User'

/** Rôles pour lesquels un centre de rattachement est obligatoire. */
export const ROLES_AVEC_CENTRE = ['chef_de_cours', 'responsable_station'] as const

export function roleExigeCentre(role: string | null | undefined): boolean {
  return !!role && (ROLES_AVEC_CENTRE as readonly string[]).includes(role)
}

/**
 * Centre de rattachement de l'utilisateur, lu en BASE (pas dans le jeton :
 * un jeton émis avant un changement de centre resterait sinon valable 7 jours).
 * Retourne null si l'utilisateur n'existe pas ou n'a pas de centre.
 */
export async function getUserCentre(userId: string): Promise<string | null> {
  const user = await AppDataSource.getRepository(User).findOne({
    where: { id: userId },
    select: { id: true, centre: true },
  })
  return user?.centre ?? null
}
