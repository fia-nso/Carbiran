import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('vehicules')
export class Vehicule {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'varchar' })
  vehicule!: string

  @Column({ type: 'varchar', unique: true })
  matricule!: string

  @Column({ type: 'varchar' })
  utilisation_affectation!: string

  @Column({ type: 'varchar', nullable: true })
  chauffeur_responsable!: string | null

  @Column({ type: 'varchar' })
  zone!: string

  @Column({ type: 'varchar', nullable: true })
  centre!: string | null

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
