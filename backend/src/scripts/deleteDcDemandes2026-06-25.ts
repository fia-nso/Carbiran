import 'reflect-metadata'
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { In } from 'typeorm'
import { AppDataSource } from '../config/database'
import { STORAGE_PATH } from '../config/storage'
import { ActivityLog } from '../entities/ActivityLog'
import { Demande } from '../entities/Demande'
import { DemandeVehicule } from '../entities/DemandeVehicule'
import { Photo } from '../entities/Photo'
import { Signature } from '../entities/Signature'
import { normalizeStoredFilename, resolveStoredSignatureFilename } from '../lib/storageAssets'

const TARGET_DEPARTEMENT = 'DC'
const TARGET_DATE = '2026-06-25'
const REQUIRED_CONFIRMATION = 'DELETE_DC_2026_06_25'

function deleteFileIfExists(folder: 'photos' | 'signatures', filename: string): boolean {
  const fullPath = path.resolve(STORAGE_PATH, folder, filename)
  if (!fs.existsSync(fullPath)) return false

  fs.unlinkSync(fullPath)
  return true
}

async function main() {
  if (process.env.CONFIRM_DELETE !== REQUIRED_CONFIRMATION) {
    console.error(
      `Suppression annulée. Lance le script avec CONFIRM_DELETE=${REQUIRED_CONFIRMATION} pour confirmer.`
    )
    process.exit(1)
  }

  await AppDataSource.initialize()

  const demandeRepo = AppDataSource.getRepository(Demande)
  const demandeVehiculeRepo = AppDataSource.getRepository(DemandeVehicule)
  const photoRepo = AppDataSource.getRepository(Photo)
  const signatureRepo = AppDataSource.getRepository(Signature)
  const logRepo = AppDataSource.getRepository(ActivityLog)

  const demandes = await demandeRepo
    .createQueryBuilder('d')
    .where('d.departement = :departement', { departement: TARGET_DEPARTEMENT })
    .andWhere('DATE(d.created_at) = :targetDate', { targetDate: TARGET_DATE })
    .orderBy('d.created_at', 'ASC')
    .getMany()

  if (demandes.length === 0) {
    console.log(`Aucune demande trouvée pour ${TARGET_DEPARTEMENT} le ${TARGET_DATE}.`)
    await AppDataSource.destroy()
    return
  }

  const demandeIds = demandes.map((demande) => demande.id)

  const demandeVehicules = await demandeVehiculeRepo.find({
    where: { demande_id: In(demandeIds) },
    select: { id: true, demande_id: true },
  })
  const demandeVehiculeIds = demandeVehicules.map((item) => item.id)

  const photos = demandeVehiculeIds.length > 0
    ? await photoRepo.find({
      where: { demande_vehicule_id: In(demandeVehiculeIds) },
      select: { id: true, url: true, demande_vehicule_id: true },
    })
    : []

  const signatures = await signatureRepo.find({
    where: { demande_id: In(demandeIds) },
    select: { id: true, demande_id: true, signature_url: true, user_id: true, role: true },
  })

  const photoFilenames = Array.from(new Set(
    photos
      .map((photo) => normalizeStoredFilename(photo.url))
      .filter((filename): filename is string => Boolean(filename))
  ))

  const signatureFilenames = Array.from(new Set(
    signatures
      .map((signature) => resolveStoredSignatureFilename(signature))
      .filter((filename): filename is string => Boolean(filename))
  ))

  console.log(`Demandes trouvées: ${demandes.length}`)
  console.log(`Demandes véhicules liés: ${demandeVehicules.length}`)
  console.log(`Photos liées: ${photos.length}`)
  console.log(`Signatures liées: ${signatures.length}`)

  await AppDataSource.transaction(async (manager) => {
    await manager.delete(Demande, { id: In(demandeIds) })

    await manager.save(ActivityLog, {
      module: 'maintenance',
      action: 'bulk_delete_test_demandes',
      target_table: 'demandes_ravitaillement',
      target_id: `${TARGET_DEPARTEMENT}:${TARGET_DATE}`,
      description: `Suppression manuelle de ${demandes.length} demande(s) ${TARGET_DEPARTEMENT} créées le ${TARGET_DATE}`,
      metadata: {
        departement: TARGET_DEPARTEMENT,
        date: TARGET_DATE,
        demandeIds,
        demandeCount: demandes.length,
        demandeVehiculeCount: demandeVehicules.length,
        photoCount: photos.length,
        signatureCount: signatures.length,
      },
      before_data: {
        demandes,
        demandeVehicules,
        photos,
        signatures,
      },
      after_data: null,
      user_id: null,
      user_email: 'manual-script',
    })
  })

  let deletedPhotoFiles = 0
  for (const filename of photoFilenames) {
    if (deleteFileIfExists('photos', filename)) {
      deletedPhotoFiles += 1
    }
  }

  let deletedSignatureFiles = 0
  for (const filename of signatureFilenames) {
    if (deleteFileIfExists('signatures', filename)) {
      deletedSignatureFiles += 1
    }
  }

  console.log('Suppression terminée.')
  console.log(`Demandes supprimées: ${demandes.length}`)
  console.log(`Fichiers photo supprimés: ${deletedPhotoFiles}/${photoFilenames.length}`)
  console.log(`Fichiers signature supprimés: ${deletedSignatureFiles}/${signatureFilenames.length}`)

  await AppDataSource.destroy()
}

void main().catch(async (error) => {
  console.error('Erreur pendant la suppression ciblée:', error)

  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy()
  }

  process.exit(1)
})
