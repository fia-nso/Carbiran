import { Request } from 'express'
import fs from 'fs'
import path from 'path'

export type AssetFolder = 'photos' | 'signatures'

const STORAGE_PATH = process.env.STORAGE_PATH || './uploads'

const FALLBACK_PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
).replace(/\/+$/, '')

const LEGACY_BASE_URL = process.env.BASE_URL?.replace(/\/+$/, '') || null

function firstHeaderValue(value: string | undefined): string | null {
  if (!value) return null
  return value.split(',')[0]?.trim() || null
}

export function normalizeStoredFilename(value: string | null | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  let pathname = trimmed

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      pathname = new URL(trimmed).pathname
    } catch {
      pathname = trimmed
    }
  }

  const normalized = pathname.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? null
}

export function resolveStoredSignatureFilename(signature: {
  signature_url: string | null | undefined
  user_id?: string | null | undefined
}): string | null {
  const filename = normalizeStoredFilename(signature.signature_url)
  if (!filename) return null

  if (/^signature\.[a-z0-9]+$/i.test(filename) && signature.user_id) {
    return `${signature.user_id}-${filename}`
  }

  return filename
}

export function buildPublicOrigin(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) {
    return FALLBACK_PUBLIC_BASE_URL
  }

  const forwardedProto = firstHeaderValue(req.header('x-forwarded-proto'))
  const forwardedHost = firstHeaderValue(req.header('x-forwarded-host'))
  const host = forwardedHost || req.get('host')
  const protocol = forwardedProto || req.protocol

  if (!host) return LEGACY_BASE_URL || FALLBACK_PUBLIC_BASE_URL

  return `${protocol}://${host}`.replace(/\/+$/, '')
}

export function buildAssetUrl(
  req: Request,
  folder: AssetFolder,
  storedValue: string | null | undefined
): string | null {
  const filename = normalizeStoredFilename(storedValue)
  if (!filename) return null

  return `${buildPublicOrigin(req)}/uploads/${folder}/${encodeURIComponent(filename)}`
}

export function deleteStoredAssetFile(folder: AssetFolder, storedValue: string | null | undefined): void {
  const filename = normalizeStoredFilename(storedValue)
  if (!filename) return

  const fullPath = path.resolve(STORAGE_PATH, folder, filename)
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath)
  }
}

export function serializePhoto<T extends { url: string | null }>(req: Request, photo: T): T {
  return {
    ...photo,
    url: buildAssetUrl(req, 'photos', photo.url),
  }
}

export function serializeSignatureLike<T extends { signature_url: string | null }>(
  req: Request,
  signature: T
): T {
  return {
    ...signature,
    signature_url: (() => {
      const resolved = resolveStoredSignatureFilename(signature as T & { user_id?: string | null })
      return resolved ? `${buildPublicOrigin(req)}/uploads/signatures/${encodeURIComponent(resolved)}` : null
    })(),
  }
}

type PhotoLike = { url: string | null }
type DemandeVehiculeLike = { photos?: PhotoLike[] }
type SignatureLike = { signature_url: string | null }

export function serializeDemandeWithAssets<T extends { demande_vehicules?: DemandeVehiculeLike[] }>(
  req: Request,
  demande: T
): T {
  return {
    ...demande,
    demande_vehicules: demande.demande_vehicules?.map((dv) => ({
      ...dv,
      photos: Array.isArray(dv.photos) ? dv.photos.map((photo) => serializePhoto(req, photo)) : dv.photos,
    })) as T['demande_vehicules'],
  }
}

export function serializeBonWithAssets<T extends { signatures?: SignatureLike[] }>(
  req: Request,
  bon: T
): T {
  return {
    ...bon,
    signatures: bon.signatures?.map((signature) => serializeSignatureLike(req, signature)) as T['signatures'],
  }
}
