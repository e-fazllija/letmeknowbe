import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, Length, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PublicAttachmentDto } from '../../../public/report/dto/public-attachment.dto';

const CHANNELS = ['WEB', 'PHONE', 'EMAIL', 'OTHER', 'ALTRO'] as const;
const PRIVACY = ['ANONIMO', 'CONFIDENZIALE'] as const;

export class CreateTenantReportDto {
  @ApiProperty({ description: 'Data dell\'evento', example: '2025-10-14T09:30:00.000Z' })
  @IsDateString()
  date!: string;

  @ApiProperty({ description: 'Fonte della segnalazione', enum: CHANNELS, example: 'WEB' })
  @IsString()
  @IsIn(CHANNELS as any)
  source!: string;

  @ApiProperty({ description: 'Privacy del segnalante', enum: PRIVACY, example: 'ANONIMO', default: 'ANONIMO' })
  @IsString()
  @IsIn(PRIVACY as any)
  @IsOptional()
  privacy?: string;

  @ApiProperty({ description: 'Oggetto della segnalazione', example: 'Irregolarità in reparto contabilità' })
  @IsString()
  @Length(3, 200)
  subject!: string;

  @ApiProperty({ description: 'Reparto selezionato', example: 'dep_cuid_123' })
  @IsString()
  departmentId!: string;

  @ApiProperty({ description: 'Categoria selezionata', example: 'cat_cuid_456' })
  @IsString()
  categoryId!: string;

  @ApiProperty({ description: 'Descrizione dettagliata', example: 'Dettagli della segnalazione...', minLength: 10, maxLength: 10000 })
  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  description!: string;

  @ApiProperty({ description: 'Nominativo (solo se privacy=CONFIDENZIALE)', required: false, example: 'Mario Rossi' })
  @IsOptional()
  @IsString()
  @Length(1, 160)
  reporterName?: string;

  @ApiProperty({ description: 'Allegati caricati via presign', required: false, type: [PublicAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PublicAttachmentDto)
  attachments?: PublicAttachmentDto[];
}

