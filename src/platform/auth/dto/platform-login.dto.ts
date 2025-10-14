import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class PlatformLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(8, 128)
  password!: string;

  @ApiProperty({ description: 'Codice TOTP a 6 cifre' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

