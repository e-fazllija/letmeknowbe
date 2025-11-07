import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class TenantAttachItemDto {
  @ApiProperty({ example: 'tenant-123/tmp/550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  storageKey!: string;

  @ApiProperty({ example: 'allegato.pdf' })
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

  @ApiProperty({ required: false, example: '"d41d8cd98f00b204e9800998ecf8427e"' })
  @IsOptional()
  @IsString()
  etag?: string;

  @ApiProperty({ required: false, example: 'hmac-sha256(storageKey)' })
  @IsOptional()
  @IsString()
  hmac?: string;
}

export class TenantAttachmentsLinkDto {
  @ApiProperty({ type: [TenantAttachItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TenantAttachItemDto)
  attachments!: TenantAttachItemDto[];
}

