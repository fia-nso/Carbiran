import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'npm:resend'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, signataireName, demandeId, departement, message } =
      await req.json()

    await resend.emails.send({
      from: 'RIMATEL Carburant <carbiran@rimatel.mr>',
      to: [to],
      subject: `[RIMATEL] Signature requise — ${departement}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #166534; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">RIMATEL</h1>
            <p style="color: #bbf7d0; margin: 5px 0;">Gestion Carburant</p>
          </div>
          <div style="padding: 30px; background: #f9fafb;">
            <p>Bonjour <strong>${signataireName}</strong>,</p>
            <p>${message}</p>
            <p>Département : <strong>${departement}</strong></p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="https://carburan-rimatel.vercel.app/demandes/${demandeId}"
                 style="background-color: #166534; color: white; padding: 12px 24px;
                        text-decoration: none; border-radius: 6px; font-size: 16px;">
                Signer maintenant
              </a>
            </div>
            <p style="color: #6b7280; font-size: 12px;">
              Cellule de Contrôle, Suivi &amp; Évaluation — RIMATEL
            </p>
          </div>
        </div>
      `
    })

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
