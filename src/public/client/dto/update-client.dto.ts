import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { EmployeeRange } from '../../../generated/public';

export class UpdateClientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ enum: EmployeeRange, enumName: 'EmployeeRange' })
  @IsOptional()
  @IsEnum(EmployeeRange)
  employeeRange?: EmployeeRange;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string; // ha default "ACTIVE", override possibile
}

 