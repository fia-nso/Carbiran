import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm'
import { Demande } from './Demande'
import { Vehicule } from './Vehicule'
import { Photo } from './Photo'

@Entity('demande_vehicules')
export class DemandeVehicule {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'demande_id', type: 'varchar', length: 36 })
  demande_id!: string

  @Column({ name: 'vehicule_id', type: 'int' })
  vehicule_id!: number

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  montant!: string | null

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  n_liter!: string | null

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  kilometrage!: string | null

  @Column({ type: 'varchar', default: 'en_attente' })
  statut!: string

  @CreateDateColumn()
  created_at!: Date

  @ManyToOne(() => Demande, (d) => d.demande_vehicules, { nullable: false })
  @JoinColumn({ name: 'demande_id' })
  demande!: Demande

  @ManyToOne(() => Vehicule, { nullable: false, eager: false })
  @JoinColumn({ name: 'vehicule_id' })
  vehicule!: Vehicule

  @OneToMany(() => Photo, (p) => p.demande_vehicule)
  photos!: Photo[]
}
