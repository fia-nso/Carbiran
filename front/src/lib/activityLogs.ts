import { apiWriteLog } from '@/lib/api'

interface ActivityLogPayload {
  module: string;
  action: string;
  targetTable?: string | null;
  targetId?: string | number | null;
  description?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  metadata?: unknown;
}

export async function writeActivityLog(payload: ActivityLogPayload): Promise<void> {
  await apiWriteLog({
    module:       payload.module,
    action:       payload.action,
    target_table: payload.targetTable ?? null,
    target_id:    payload.targetId != null ? String(payload.targetId) : null,
    description:  payload.description ?? null,
    before_data:  payload.beforeData ?? null,
    after_data:   payload.afterData ?? null,
    metadata:     payload.metadata ?? null,
  })
}

export async function writeActivityLogSafe(payload: ActivityLogPayload): Promise<void> {
  try {
    await writeActivityLog(payload)
  } catch (error) {
    console.error('Erreur ecriture journal activite:', error)
  }
}
