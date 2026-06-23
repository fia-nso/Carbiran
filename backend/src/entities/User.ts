import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', unique: true })
  email!: string

  @Column({ type: 'varchar', nullable: true })
  password_hash!: string | null

  @Column({ type: 'varchar', default: 'viewer' })
  role!: string

  @Column({ type: 'varchar', nullable: true })
  nom!: string | null

  @Column({ type: 'varchar', nullable: true })
  prenom!: string | null

  @Column({ type: 'varchar', nullable: true })
  departement!: string | null

  @Column({ type: 'varchar', nullable: true })
  circuit_role!: string | null

  @Column({ type: 'varchar', nullable: true })
  notification_email!: string | null

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
