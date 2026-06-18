import { IsString, IsOptional } from 'class-validator'

export class CreateVehiculeDto {
  @IsString()
  vehicule!: string

  @IsString()
  matricule!: string

  @IsString()
  utilisation_affectation!: string

  @IsString()
  zone!: string

  @IsOptional()
  @IsString()
  chauffeur_responsable?: string

  @IsOptional()
  @IsString()
  centre?: string
}

export class UpdateVehiculeDto {
  @IsOptional()
  @IsString()
  vehicule?: string

  @IsOptional()
  @IsString()
  matricule?: string

  @IsOptional()
  @IsString()
  utilisation_affectation?: string

  @IsOptional()
  @IsString()
  chauffeur_responsable?: string | null

  @IsOptional()
  @IsString()
  zone?: string

  @IsOptional()
  @IsString()
  centre?: string | null
}
