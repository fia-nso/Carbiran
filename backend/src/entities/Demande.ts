import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn,
} from 'typeorm'
import { User } from './User'
import { DemandeVehicule } from './DemandeVehicule'

@Entity('demandes_ravitaillement')
export class Demande {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar' })
  departement!: string

  @Column({ type: 'varchar', default: 'en_attente' })
  statut!: string

  @Column({ type: 'boolean', default: false })
  situation_soumise!: boolean

  @Column({ name: 'created_by', type: 'varchar', length: 36 })
  created_by!: string

  @ManyToOne(() => User, { eager: false, nullable: false })
  @JoinColumn({ name: 'created_by' })
  creator!: User

  @OneToMany(() => DemandeVehicule, (dv) => dv.demande)
  demande_vehicules!: DemandeVehicule[]

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date
}
