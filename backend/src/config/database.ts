import { DataSource } from 'typeorm'
import { User } from '../entities/User'
import { Vehicule } from '../entities/Vehicule'
import { Demande } from '../entities/Demande'
import { DemandeVehicule } from '../entities/DemandeVehicule'
import { Ravitaillement } from '../entities/Ravitaillement'
import { Photo } from '../entities/Photo'
import { Notification } from '../entities/Notification'
import { Signature } from '../entities/Signature'
import { SignatureUtilisateur } from '../entities/SignatureUtilisateur'
import { ActivityLog } from '../entities/ActivityLog'

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'carbiran',
  synchronize: true,
  logging: false,
  entities: [
    User,
    Vehicule,
    Demande,
    DemandeVehicule,
    Ravitaillement,
    Photo,
    Notification,
    Signature,
    SignatureUtilisateur,
    ActivityLog,
  ],
  migrations: ['src/migrations/*.ts'],
})
