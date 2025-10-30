import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TranscribeRequestDto {
  @ApiProperty({ description: 'Nome modello Whisper (opzionale, es. large, base, tiny, turbo)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  modelName?: string;
}
