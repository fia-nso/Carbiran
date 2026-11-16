import { Request, Response } from 'express'
import { CentreService } from '../services/centreService'

const centreService = new CentreService()

function sendError(res: Response, err: any, label: string): void {
  if (err?.status) { res.status(err.status).json({ error: err.message }); return }
  console.error(label, err)
  res.status(500).json({ error: 'Erreur serveur' })
}

/** GET /centres?actifs=1 — tout utilisateur connecté. */
export const getCentres = async (req: Request, res: Response): Promise<void> => {
  try {
    const actifs = req.query['actifs']
    res.json(await centreService.findAll({ actifsSeulement: actifs === '1' || actifs === 'true' }))
  } catch (err) {
    sendError(res, err, '[GET /centres]')
  }
}

/** GET /centres/:code — tout utilisateur connecté. */
export const getCentre = async (req: Request, res: Response): Promise<void> => {
  try {
    const centre = await centreService.findByCode(req.params['code'] as string)
    if (!centre) { res.status(404).json({ error: 'Centre introuvable' }); return }
    res.json(centre)
  } catch (err) {
    sendError(res, err, '[GET /centres/:code]')
  }
}

/** POST /centres — Admin. Body : { code, nom, zone, actif? } */
export const createCentreHandler = async (req: Request, res: Response): Promise<void> => {
  const { code, nom, zone, actif } = (req.body ?? {}) as Record<string, unknown>
  try {
    const centre = await centreService.create({ code, nom, zone, actif })
    res.status(201).json(centre)
  } catch (err) {
    sendError(res, err, '[POST /centres]')
  }
}

/** PATCH /centres/:code — Admin. Body : { nom?, zone?, actif? } (jamais le code). */
export const updateCentreHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const centre = await centreService.update(req.params['code'] as string, (req.body ?? {}) as Record<string, unknown>)
    res.json(centre)
  } catch (err) {
    sendError(res, err, '[PATCH /centres/:code]')
  }
}
