import { apiDeletePhotosForDv, apiUploadPhoto } from '@/lib/api'

export async function uploadPhoto(
  file: File,
  demandeVehiculeId: string,
  type: 'vehicule_avant' | 'vehicule_apres' | 'pompe'
): Promise<string> {
  await apiDeletePhotosForDv(demandeVehiculeId, type)
  const result = await apiUploadPhoto(file, demandeVehiculeId, type)
  return (result as { url: string }).url
}
