import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString } from 'class-validator';
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
}
 