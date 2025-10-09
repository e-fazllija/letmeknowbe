import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsISO8601 } from 'class-validator';
import { BillingCycle, ContractTerm, PaymentMethod, SubscriptionStatus } from '../../../generated/public';

export class CreateSubscriptionDto {
  @ApiProperty()
  @IsString()
  clientId!: string;

  @ApiProperty()
  @IsNumber()
  amount!: number;

  @ApiProperty({ example: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ enum: BillingCycle, enumName: 'BillingCycle' })
  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle; // MENSILE | ANNUALE

  @ApiProperty({ enum: ContractTerm, enumName: 'ContractTerm' })
  @IsEnum(ContractTerm)
  contractTerm!: ContractTerm; // ONE_YEAR | THREE_YEARS

  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ enum: SubscriptionStatus, enumName: 'SubscriptionStatus', default: 'ACTIVE' })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ description: 'Data inizio' })
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
