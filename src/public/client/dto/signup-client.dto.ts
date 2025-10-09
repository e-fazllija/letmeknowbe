import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsEnum, IsString, IsOptional, Length, Matches, IsNumber, IsISO8601, ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EmployeeRange,
  BillingCycle,
  ContractTerm,
  PaymentMethod,
  SubscriptionStatus,
  ClientStatus
} from '../../../generated/public';

// --- Blocchi annidati ---

export class SignupClientBillingDto {
  @ApiProperty({ description: 'P.IVA/CF (univoco)' })
  @IsString()
  @Length(8, 28)
  billingTaxId!: string;

  @ApiProperty()
  @IsEmail()
  billingEmail!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingPec?: string;

  @ApiPropertyOptional({ description: 'SDI 7 alfanumerici o 0000000' })
  @IsOptional()
  @Matches(/^[A-Z0-9]{7}$/i)
  billingSdiCode?: string;

  @ApiProperty()
  @IsString()
  billingAddressLine1!: string;

  @ApiProperty({ example: '00100' })
  @Matches(/^\d{5}$/)
  billingZip!: string;

  @ApiProperty()
  @IsString()
  billingCity!: string;

  @ApiProperty({ example: 'RM' })
  @Matches(/^[A-Z]{2}$/i)
  billingProvince!: string;

  @ApiProperty({ example: 'Italia' })
  @IsString()
  billingCountry!: string;
}

export class SignupClientCoreDto {
  @ApiProperty()
  @IsString()
  companyName!: string;

  @ApiProperty()
  @IsEmail()
  contactEmail!: string;

  @ApiProperty({ enum: EmployeeRange, enumName: 'EmployeeRange' })
  @IsEnum(EmployeeRange)
  employeeRange!: EmployeeRange;

  @ApiPropertyOptional({ enum: ClientStatus, enumName: 'ClientStatus', default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus;

  @ApiProperty({ type: SignupClientBillingDto })
  @ValidateNested()
  @Type(() => SignupClientBillingDto)
  billing!: SignupClientBillingDto;
}

export class SignupSubscriptionDto {
  @ApiProperty({ enum: BillingCycle, enumName: 'BillingCycle' })
  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @ApiProperty({ enum: ContractTerm, enumName: 'ContractTerm' })
  @IsEnum(ContractTerm)
  contractTerm!: ContractTerm;

  @ApiProperty()
  @IsNumber()
  amount!: number;

  @ApiProperty({ example: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus', default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  nextBillingAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  trialEndsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  canceledAt?: string;
}

export class SignupOptionsDto {
  @ApiPropertyOptional({ description: 'Chiave idempotenza; meglio passarla in header' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class SignupClientDto {
  @ApiProperty({ type: SignupClientCoreDto })
  @ValidateNested()
  @Type(() => SignupClientCoreDto)
  client!: SignupClientCoreDto;

  @ApiProperty({ type: SignupSubscriptionDto })
  @ValidateNested()
  @Type(() => SignupSubscriptionDto)
  subscription!: SignupSubscriptionDto;

  @ApiPropertyOptional({ type: SignupOptionsDto })
  @ValidateNested()
  @Type(() => SignupOptionsDto)
  @IsOptional()
  options?: SignupOptionsDto;
}
