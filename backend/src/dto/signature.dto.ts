import { IsString, IsNumber, IsOptional } from 'class-validator'

export class CreateSignatureDto {
  @IsString()
  demande_id!: string

  @IsString()
  role!: string

  @IsNumber()
  ordre!: number

  @IsOptional()
  @IsString()
  circuit?: string

  @IsOptional()
  @IsString()
  departement?: string
}
