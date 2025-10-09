import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { EmployeeRange, ClientStatus } from '../../../generated/public';

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

  @ApiPropertyOptional({ enum: ClientStatus, enumName: 'ClientStatus' })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  // === Billing (tutti opzionali in PATCH) ===
  @ApiPropertyOptional({ description: 'P.IVA/CF' })
  @IsOptional()
  @IsString()
  @Length(8, 28)
  billingTaxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingPec?: string;

  @ApiPropertyOptional({ description: 'SDI 7 alfanumerici' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{7}$/i)
  billingSdiCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingAddressLine1?: string;

  @ApiPropertyOptional({ example: '00100' })
  @IsOptional()
  @Matches(/^\d{5}$/)
  billingZip?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingCity?: string;

  @ApiPropertyOptional({ example: 'RM' })
  @IsOptional()
  @Matches(/^[A-Z]{2}$/i)
  billingProvince?: string;

  @ApiPropertyOptional({ example: 'Italia' })
  @IsOptional()
  @IsString()
  billingCountry?: string;
}
