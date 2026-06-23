import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail(
  to: string,
  signataireName: string,
  demandeId: string,
  departement: string,
  message: string
) {
  try {
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
              <a href="${process.env.FRONTEND_URL}/demandes/${demandeId}"
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
  } catch (err) {
    console.error('[Email Error]', err)
  }
}
