import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, IsISO8601 } from 'class-validator';
import { ContractTerm, InstallmentPlan, SubscriptionStatus } from '../../../generated/public';

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

  @ApiPropertyOptional({ enum: ContractTerm, enumName: 'ContractTerm' })
  @IsOptional()
  @IsEnum(ContractTerm)
  contractTerm?: ContractTerm;

  @ApiPropertyOptional({ description: 'SubscriptionPlan id' })
  @IsOptional()
  @IsString()
  subscriptionPlanId?: string;

  @ApiPropertyOptional({ enum: InstallmentPlan, enumName: 'InstallmentPlan' })
  @IsOptional()
  @IsEnum(InstallmentPlan)
  installmentPlan?: InstallmentPlan;

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
  endsAt?: string;
}
