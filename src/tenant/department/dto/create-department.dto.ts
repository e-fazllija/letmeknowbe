import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty()
  @IsString()
  @Length(2, 100)
  name!: string;
}

