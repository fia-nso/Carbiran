import { supabase } from '@/supabaseClient'

export async function sendSignatureEmail(
  to: string, // TODO: remplacer testTo par `to` dans l'edge function (vrai destinataire)
  signataireName: string,
  demandeId: string,
  departement: string,
  message: string
) {
  try {
    const { data: { session } } = await supabase.auth.getSession()

    const body = JSON.stringify({
      to,
      signataireName,
      demandeId,
      departement,
      message
    })

    console.log('Envoi email:', body)

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/send-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body
      }
    )

    const result = await response.json()
    console.log('Résultat email:', result)
  } catch (error) {
    console.error('Erreur envoi email:', error)
  }
}
