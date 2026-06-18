import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator'

export class LoginDto {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(6)
  password!: string
}

export class CreateUserDto {
  @IsEmail()
  email!: string

  @IsString()
  @MinLength(6)
  password!: string

  @IsString()
  role!: string

  @IsOptional()
  @IsString()
  nom?: string

  @IsOptional()
  @IsString()
  prenom?: string

  @IsOptional()
  @IsString()
  departement?: string

  @IsOptional()
  @IsString()
  circuit_role?: string

  @IsOptional()
  @IsString()
  notification_email?: string
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string

  @IsString()
  @MinLength(6)
  newPassword!: string
}
