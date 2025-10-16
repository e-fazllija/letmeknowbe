import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class RequestInfoDto {
  @ApiProperty({ description: 'Messaggio pubblico al segnalante (richiesta chiarimenti)', example: 'Puoi indicare data e luogo dell\'evento?' })
  @IsString()
  @Length(3, 5000)
  message!: string;

  @ApiProperty({ description: 'Nota interna per audit (facoltativa)', required: false, example: 'Mancano dettagli minimi per procedere' })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  note?: string;
}

