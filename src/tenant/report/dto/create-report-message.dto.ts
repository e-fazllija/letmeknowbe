import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateReportMessageDto {
  @ApiProperty()
  @IsString()
  tenantId!: string;

  @ApiProperty()
  @IsString()
  reportId!: string;

  @ApiProperty()
  @IsString()
  author!: string;

  @ApiProperty()
  @IsString()
  body!: string;
}
 