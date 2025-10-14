import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ActivateDto {
  @ApiProperty({ description: 'Selector UUID inviato via e-mail' })
  @IsString()
  selector!: string;

  @ApiProperty({ description: 'Token segreto (non persiste in DB)' })
  @IsString()
  @Length(16, 128)
  token!: string;

  @ApiProperty({ description: 'Nuova password' })
  @IsString()
  @Length(8, 128)
  password!: string;
}

