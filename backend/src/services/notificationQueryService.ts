import { AppDataSource } from '../config/database'
import { Notification } from '../entities/Notification'

function repo() {
  return AppDataSource.getRepository(Notification)
}

export class NotificationService {
  async findByUserId(userId: string) {
    return repo().find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: 100,
    })
  }

  async markRead(id: string, userId: string) {
    const notif = await repo().findOne({ where: { id, user_id: userId } })
    if (!notif) return null
    notif.lu = true
    return repo().save(notif)
  }

  async markAllRead(userId: string) {
    await repo().update({ user_id: userId }, { lu: true })
  }
}
