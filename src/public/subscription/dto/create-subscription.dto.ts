import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsISO8601 } from 'class-validator';
import { ContractTerm, InstallmentPlan, SubscriptionStatus } from '../../../generated/public';

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

  @ApiProperty({ enum: ContractTerm, enumName: 'ContractTerm' })
  @IsEnum(ContractTerm)
  contractTerm!: ContractTerm; // ONE_YEAR | THREE_YEARS

  @ApiProperty({ description: 'SubscriptionPlan id' })
  @IsString()
  subscriptionPlanId!: string;

  @ApiProperty({ enum: InstallmentPlan, enumName: 'InstallmentPlan' })
  @IsEnum(InstallmentPlan)
  installmentPlan!: InstallmentPlan;

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
  endsAt?: string;
}
