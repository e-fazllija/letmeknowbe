import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class VoiceTranscriptDto {
  @ApiProperty({ description: 'Testo della trascrizione', example: 'Trascrizione del contenuto audio...' })
  @IsString()
  @Length(3, 20000)
  transcript!: string;
}

