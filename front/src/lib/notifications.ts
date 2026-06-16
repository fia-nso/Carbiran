// Toutes les notifications sont maintenant gérées côté backend Express.
// Ces fonctions sont conservées pour la compatibilité des imports existants
// mais ne font rien — le backend émet les notifications automatiquement.

export async function createNotification(
  _userId: string,
  _message: string,
  _type: string,
  _demandeId?: string
): Promise<void> {}

export async function notifyByRole(
  _role: string,
  _message: string,
  _type: string,
  _demandeId?: string
): Promise<void> {}

export async function notifyByRoleAndDept(
  _role: string,
  _dept: string,
  _message: string,
  _type: string,
  _demandeId?: string
): Promise<void> {}

export async function notifyByRoles(
  _roles: string[],
  _message: string,
  _type: string,
  _demandeId?: string
): Promise<void> {}
