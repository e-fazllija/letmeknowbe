import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class SignupDto {
  @ApiProperty()
  @IsString()
  tenantId!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;

  @ApiProperty({ example: 'ADMIN' })
  @IsString()
  role!: string;
}
 