import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../../../generated/tenant';

export class SignupDto {
  @ApiProperty()
  @IsString()
  clientId!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiProperty({ enum: UserRole, example: 'ADMIN' })
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(UserRole)
  role!: UserRole;
}
 
