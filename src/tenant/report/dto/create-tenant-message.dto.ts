import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export enum TenantMessageVisibility {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
}

export class CreateTenantMessageDto {
  @ApiProperty({ description: 'ID del report', example: 'rep_cuid_123' })
  @IsString()
  reportId!: string;

  @ApiProperty({ description: 'Contenuto del messaggio/nota', example: 'Promemoria interno oppure richiesta chiarimenti' })
  @IsString()
  @Length(1, 5000)
  body!: string;

  @ApiProperty({ description: 'Visibilità del messaggio', enum: TenantMessageVisibility, required: false, default: 'INTERNAL' })
  @IsOptional()
  @IsEnum(TenantMessageVisibility)
  visibility?: TenantMessageVisibility;
}

