import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class MfaCodeDto {
  @ApiProperty({ description: 'Codice TOTP a 6 cifre generato dall\'app di autenticazione' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class MfaRecoveryDto {
  @ApiProperty({ description: 'Codice di recupero fornito durante il setup (20-24 caratteri)' })
  @IsString()
  @Length(8, 32)
  code!: string;
}

export class MfaDisableDto {
  @ApiProperty({ description: 'Password attuale dell\'utente' })
  @IsString()
  password!: string;

  @ApiProperty({ description: 'Codice TOTP o codice di recupero', required: false })
  @IsString()
  @Length(6, 32)
  code?: string;
}

