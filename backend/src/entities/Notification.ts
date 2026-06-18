import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm'

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  user_id!: string

  @Column({ type: 'varchar' })
  message!: string

  @Column({ name: 'type', type: 'varchar' })
  type!: string

  @Column({ type: 'boolean', default: false })
  lu!: boolean

  @Column({ name: 'demande_id', type: 'varchar', length: 36, nullable: true })
  demande_id!: string | null

  @CreateDateColumn()
  created_at!: Date
}
