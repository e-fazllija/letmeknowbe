import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FinalizeItemDto {
  @ApiProperty({ example: 'tenant_123/tmp/uuid.pdf' })
  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @ApiProperty({ example: '"d41d8cd98f00b204e9800998ecf8427e"' })
  @IsString()
  @IsOptional()
  etag?: string;

  @ApiProperty({ example: 1024 })
  @IsNumber()
  sizeBytes!: number;

  @ApiProperty({ example: 'allegato.pdf' })
  @IsString()
  fileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ description: 'HMAC di conferma', example: 'abcdef0123' })
  @IsString()
  @IsOptional()
  hmac?: string;
}

export class AttachmentsFinalizeDto {
  @ApiProperty({ type: [FinalizeItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalizeItemDto)
  items!: FinalizeItemDto[];
}

