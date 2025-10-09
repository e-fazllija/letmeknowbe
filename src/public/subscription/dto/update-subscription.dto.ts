import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsISO8601 } from 'class-validator';
import { BillingCycle, ContractTerm, PaymentMethod, SubscriptionStatus } from '../../../generated/public';

export class UpdateSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: BillingCycle, enumName: 'BillingCycle' })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({ enum: ContractTerm, enumName: 'ContractTerm' })
  @IsOptional()
  @IsEnum(ContractTerm)
  contractTerm?: ContractTerm;

  @ApiPropertyOptional({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus' })
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
