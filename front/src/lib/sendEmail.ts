// Les emails sont maintenant envoyés côté backend Express (routes signatures).
// Cette fonction est conservée pour la compatibilité des imports existants.

export async function sendSignatureEmail(
  _to: string,
  _signataireName: string,
  _demandeId: string,
  _departement: string,
  _message: string
): Promise<void> {}
