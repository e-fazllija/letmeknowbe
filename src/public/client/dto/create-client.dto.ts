import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, Length, IsOptional, Matches } from 'class-validator';
import { EmployeeRange } from '../../../generated/public';

export class CreateClientDto {
  @ApiProperty()
  @IsString()
  companyName!: string;

  @ApiProperty()
  @IsEmail()
  contactEmail!: string;

  @ApiProperty({ enum: EmployeeRange, enumName: 'EmployeeRange' })
  @IsEnum(EmployeeRange)
  employeeRange!: EmployeeRange;

  // Billing fields 
  @ApiProperty({ description: 'P.IVA o CF (univoco)' })
  @IsString()
  @Length(8, 28) // soft range per P.IVA/CF 
  billingTaxId!: string;

  @ApiProperty()
  @IsEmail()
  billingEmail!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  billingPec?: string;

  @ApiProperty({ required: false, description: 'Codice Destinatario SDI (7 alfanumerici) o 0000000 con sola PEC' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{7}$/i, { message: 'billingSdiCode deve avere 7 caratteri alfanumerici' })
  billingSdiCode?: string;

  @ApiProperty()
  @IsString()
  billingAddressLine1!: string;

  @ApiProperty({ example: '00100' })
  @Matches(/^\d{5}$/, { message: 'billingZip deve essere CAP a 5 cifre' })
  billingZip!: string;

  @ApiProperty()
  @IsString()
  billingCity!: string;

  @ApiProperty({ example: 'RM' })
  @Matches(/^[A-Z]{2}$/i, { message: 'billingProvince deve essere di 2 lettere (es. RM)' })
  billingProvince!: string;

  @ApiProperty({ example: 'Italia' })
  @IsString()
  billingCountry!: string;
}