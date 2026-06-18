import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm'

@Entity('activity_logs')
export class ActivityLog {
  @PrimaryGeneratedColumn()
  id!: number

  @CreateDateColumn()
  created_at!: Date

  @Column({ name: 'user_id', type: 'varchar', length: 36, nullable: true })
  user_id!: string | null

  @Column({ name: 'user_email', type: 'varchar', nullable: true })
  user_email!: string | null

  @Column({ type: 'varchar' })
  module!: string

  @Column({ type: 'varchar' })
  action!: string

  @Column({ name: 'target_table', type: 'varchar', nullable: true })
  target_table!: string | null

  @Column({ name: 'target_id', type: 'varchar', nullable: true })
  target_id!: string | null

  @Column({ type: 'varchar', nullable: true })
  description!: string | null

  @Column({ name: 'before_data', type: 'json', nullable: true })
  before_data!: unknown

  @Column({ name: 'after_data', type: 'json', nullable: true })
  after_data!: unknown

  @Column({ type: 'json', nullable: true })
  metadata!: unknown
}
