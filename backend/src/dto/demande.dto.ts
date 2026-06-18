import { IsString, IsArray, IsOptional, IsBoolean, IsNumber, IsIn } from 'class-validator'

export class CreateDemandeDto {
  @IsString()
  departement!: string

  @IsArray()
  @IsNumber({}, { each: true })
  vehicule_ids!: number[]
}

export class PatchDemandeDto {
  @IsOptional()
  @IsString()
  statut?: string

  @IsOptional()
  @IsBoolean()
  situation_soumise?: boolean
}

export class PatchDemandeVehiculeDto {
  @IsOptional()
  @IsNumber()
  montant?: number

  @IsOptional()
  @IsNumber()
  n_liter?: number

  @IsOptional()
  @IsNumber()
  kilometrage?: number

  @IsOptional()
  @IsString()
  @IsIn(['en_attente', 'ravitaille', 'valide', 'refuse'])
  statut?: string
}
