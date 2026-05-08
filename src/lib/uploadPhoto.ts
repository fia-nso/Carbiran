import { supabase } from '../supabaseClient'

export async function uploadPhoto(
  file: File,
  demandeVehiculeId: string,
  type: 'vehicule_avant' | 'vehicule_apres' | 'pompe'
): Promise<string> {
  const fileName = `${demandeVehiculeId}/${type}_${Date.now()}.${file.name.split('.').pop()}`

  const { error } = await supabase.storage
    .from('ravitaillement-photos')
    .upload(fileName, file, { upsert: true })

  if (error) throw error

  const { data } = supabase.storage
    .from('ravitaillement-photos')
    .getPublicUrl(fileName)

  await supabase.from('photos_justification').insert({
    demande_vehicule_id: demandeVehiculeId,
    url: data.publicUrl,
    type
  })

  return data.publicUrl
}
