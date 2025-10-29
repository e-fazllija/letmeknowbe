import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class TranscribeRequestDto {
  @ApiProperty({ description: 'Storage key ottenuta dal presign', example: 'tenant-123/tmp/550e8400-e29b-41d4-a716-446655440000.webm' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  storageKey!: string;

  @ApiProperty({ description: 'Nome modello Whisper (opzionale, es. large, base, tiny, turbo)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  modelName?: string;

  @ApiProperty({ description: "Se true, ritorna anche i metadati dell'allegato per includerlo nel report", required: false, default: false })
  @IsOptional()
  @IsBoolean()
  includeAudio?: boolean;
}
