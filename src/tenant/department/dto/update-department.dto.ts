import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateDepartmentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;
}

