import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm'
import { Vehicule } from './Vehicule'

@Entity('ravitaillements_vehicules')
export class Ravitaillement {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'date' })
  date!: string

  @Column({ name: 'vehicule_id', type: 'int' })
  vehicule_id!: number

  @Column({ name: 'montant_ravitaille', type: 'decimal', precision: 14, scale: 2 })
  montant_ravitaille!: string

  @Column({ type: 'varchar', default: '' })
  commentaire!: string

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  kilometrage!: string

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  n_liter!: string

  @CreateDateColumn()
  created_at!: Date

  @UpdateDateColumn()
  updated_at!: Date

  @ManyToOne(() => Vehicule, { nullable: false, eager: false })
  @JoinColumn({ name: 'vehicule_id' })
  vehicule!: Vehicule
}
