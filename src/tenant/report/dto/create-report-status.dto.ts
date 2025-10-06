import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportStatus } from '../../../generated/tenant';


export class CreateReportStatusDto {
  @ApiProperty()
  @IsString()
  clientId!: string;

  @ApiProperty()
  @IsString()
  reportId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  note?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  author?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  agentId?: string;

  @ApiProperty({ enum: ReportStatus })
  @IsEnum(ReportStatus)
  status!: ReportStatus;
}
 