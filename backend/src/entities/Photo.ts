import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm'
import { DemandeVehicule } from './DemandeVehicule'

@Entity('photos_justification')
export class Photo {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'demande_vehicule_id', type: 'varchar', length: 36 })
  demande_vehicule_id!: string

  @Column({ type: 'varchar' })
  url!: string

  @Column({ type: 'varchar' })
  type!: string

  @CreateDateColumn({ name: 'uploaded_at' })
  uploaded_at!: Date

  @ManyToOne(() => DemandeVehicule, (dv) => dv.photos, { nullable: false })
  @JoinColumn({ name: 'demande_vehicule_id' })
  demande_vehicule!: DemandeVehicule
}
