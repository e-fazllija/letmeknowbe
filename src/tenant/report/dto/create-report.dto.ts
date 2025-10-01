import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ReportStatus, ReportChannel } from '../../../generated/tenant';


export class CreateReportDto {
  @ApiProperty()
  @IsString()
  tenantId!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiProperty({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiProperty({ enum: ReportChannel })
  @IsOptional()
  @IsEnum(ReportChannel)
  channel?: ReportChannel;
}
 