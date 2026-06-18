import {
  Entity, PrimaryGeneratedColumn, Column, Unique,
} from 'typeorm'

@Entity('signatures_situation')
@Unique(['demande_id', 'role', 'circuit'])
export class Signature {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'demande_id', type: 'varchar', length: 36, nullable: true })
  demande_id!: string | null

  @Column({ type: 'varchar' })
  role!: string

  @Column({ name: 'user_id', type: 'varchar', length: 36, nullable: true })
  user_id!: string | null

  @Column({ name: 'signature_url', type: 'varchar', nullable: true })
  signature_url!: string | null

  @Column({ type: 'datetime', nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  signe_le!: Date | null

  @Column({ type: 'int' })
  ordre!: number

  @Column({ type: 'varchar', default: 'situation' })
  circuit!: string
}
