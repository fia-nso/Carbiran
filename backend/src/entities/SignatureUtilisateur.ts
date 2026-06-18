import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique,
} from 'typeorm'

@Entity('signatures_utilisateurs')
@Unique(['user_id'])
export class SignatureUtilisateur {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'user_id', type: 'varchar', length: 36 })
  user_id!: string

  @Column({ type: 'varchar' })
  role!: string

  @Column({ name: 'signature_url', type: 'varchar' })
  signature_url!: string

  @CreateDateColumn()
  created_at!: Date
}
