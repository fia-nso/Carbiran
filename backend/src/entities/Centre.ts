import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

/**
 * Centres RIMATEL (NKTT, KIFFA, ...).
 * `code` = valeur exacte de vehicules.centre / demandes_ravitaillement.centre / users.centre.
 * Les types doivent rester identiques à sql/migration_centres.sql
 * (sinon `synchronize: true` supprime et recrée les colonnes).
 */
@Entity('centres')
export class Centre {
  @PrimaryColumn({ type: 'varchar' })
  code!: string

  @Column({ type: 'varchar' })
  nom!: string

  /** 'Zone A' ou 'Zone B' (contrôlé par l'application) */
  @Column({ type: 'varchar' })
  zone!: string

  @Column({ type: 'boolean', default: true })
  actif!: boolean

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
