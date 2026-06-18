import { IsString, IsOptional } from 'class-validator'

export class CreateLogDto {
  @IsString()
  module!: string

  @IsString()
  action!: string

  @IsOptional()
  @IsString()
  target_table?: string

  @IsOptional()
  target_id?: unknown

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  before_data?: unknown

  @IsOptional()
  after_data?: unknown

  @IsOptional()
  metadata?: unknown
}
