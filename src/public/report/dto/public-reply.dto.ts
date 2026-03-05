import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { PublicAttachmentDto } from './public-attachment.dto';

export class PublicReplyDto {
  @ApiProperty({ description: 'Codice pubblico del report', example: 'R-AB12-CD34' })
  @IsString()
  publicCode!: string;

  @ApiProperty({ description: 'Segreto mostrato una sola volta in fase di creazione', example: '<SECRET>' })
  @IsString()
  @Length(16, 256)
  secret!: string;

  @ApiProperty({ description: 'Contenuto della replica', example: 'Ulteriori dettagli richiesti...', minLength: 1, maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  body!: string;

  @ApiProperty({ description: 'Allegati (se presign attivo)', required: false, type: [PublicAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PublicAttachmentDto)
  attachments?: PublicAttachmentDto[];
}

