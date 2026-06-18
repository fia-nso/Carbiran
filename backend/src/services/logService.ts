import { AppDataSource } from '../config/database'
import { ActivityLog } from '../entities/ActivityLog'

function repo() {
  return AppDataSource.getRepository(ActivityLog)
}

export class LogService {
  async findAll() {
    return repo().find({ order: { created_at: 'DESC', id: 'DESC' }, take: 500 })
  }

  async create(data: {
    user_id: string
    user_email: string
    module: unknown
    action: unknown
    target_table?: unknown
    target_id?: unknown
    description?: unknown
    before_data?: unknown
    after_data?: unknown
    metadata?: unknown
  }) {
    const log = repo().create({
      user_id: data.user_id,
      user_email: data.user_email,
      module: String(data.module ?? ''),
      action: String(data.action ?? ''),
      target_table: data.target_table != null ? String(data.target_table) : null,
      target_id: data.target_id != null ? String(data.target_id) : null,
      description: data.description != null ? String(data.description) : null,
      before_data: data.before_data ?? null,
      after_data: data.after_data ?? null,
      metadata: data.metadata ?? null,
    })
    return repo().save(log)
  }
}
