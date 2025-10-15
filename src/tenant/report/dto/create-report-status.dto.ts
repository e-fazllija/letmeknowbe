import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
// Nota: accettiamo valori testuali per includere anche NEED_INFO senza dipendere dalla rigenerazione del client
export const REPORT_STATUS_VALUES = ['OPEN', 'IN_PROGRESS', 'SUSPENDED', 'NEED_INFO', 'CLOSED'] as const;


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

  @ApiProperty({
    enum: REPORT_STATUS_VALUES,
    description: 'Nuovo stato del report (OPEN, IN_PROGRESS, SUSPENDED, NEED_INFO, CLOSED)',
  })
  @IsString()
  status!: string;
}
 
