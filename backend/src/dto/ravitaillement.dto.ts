import { IsString, IsNumber, IsOptional } from 'class-validator'

export class CreateRavitaillementDto {
  @IsString()
  date!: string

  @IsNumber()
  vehicule_id!: number

  @IsNumber()
  montant_ravitaille!: number

  @IsOptional()
  @IsString()
  commentaire?: string

  @IsOptional()
  @IsNumber()
  kilometrage?: number

  @IsOptional()
  @IsNumber()
  n_liter?: number
}

export class UpdateRavitaillementDto {
  @IsOptional()
  @IsString()
  date?: string

  @IsOptional()
  @IsNumber()
  vehicule_id?: number

  @IsOptional()
  @IsNumber()
  montant_ravitaille?: number

  @IsOptional()
  @IsString()
  commentaire?: string

  @IsOptional()
  @IsNumber()
  kilometrage?: number

  @IsOptional()
  @IsNumber()
  n_liter?: number
}
