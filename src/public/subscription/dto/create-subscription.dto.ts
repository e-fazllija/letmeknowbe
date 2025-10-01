import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { SubscriptionPlan, PaymentMethod } from '../../../generated/public';


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

  @ApiProperty({ enum: SubscriptionPlan })
  @IsEnum(SubscriptionPlan)
  plan!: SubscriptionPlan;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiProperty({ example: 'SUCCESS' })
  @IsOptional()
  @IsString()
  status?: string;
}
 