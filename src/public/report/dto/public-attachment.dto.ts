import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min, Matches } from 'class-validator';

export class PublicAttachmentDto {
  @ApiProperty({ example: 'prova.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  mimeType!: string;

  @ApiProperty({ example: 524288 })
  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty({ example: 'tenant-123/tmp/550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  storageKey!: string;
}

