import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { PublicAttachmentDto } from '../../report/dto/public-attachment.dto';

const PRIVACY = ['ANONIMO', 'CONFIDENZIALE'] as const;

export class CreateVoiceReportDto {
  @ApiProperty({ description: 'Data dell\'evento', example: '2025-10-14T09:30:00.000Z' })
  @IsDateString()
  date!: string;

  @ApiProperty({ description: 'Privacy del segnalante', enum: PRIVACY, example: 'ANONIMO', default: 'ANONIMO' })
  @IsString()
  @IsIn(PRIVACY as any)
  privacy!: string;

  @ApiProperty({ description: 'Oggetto della segnalazione', example: 'Segnalazione vocale' })
  @IsString()
  @Length(3, 200)
  subject!: string;

  @ApiProperty({ description: 'Reparto selezionato', example: 'dep_cuid_123' })
  @IsString()
  @IsNotEmpty()
  departmentId!: string;

  @ApiProperty({ description: 'Categoria selezionata', example: 'cat_cuid_456' })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ description: 'Descrizione opzionale (la trascrizione arriverà in seguito)', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Allegati audio via presign', type: [PublicAttachmentDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PublicAttachmentDto)
  attachments?: PublicAttachmentDto[];
}

