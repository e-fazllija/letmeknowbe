import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../../../generated/tenant';

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
 
