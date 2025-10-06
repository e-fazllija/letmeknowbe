import { ApiProperty } from '@nestjs/swagger';

export class CreatePublicUserDto {
  @ApiProperty({ description: 'ID del client associato' })
  clientId: string;

  @ApiProperty({ description: 'ID del report collegato' })
  reportId: string;

  @ApiProperty({ description: 'Token univoco assegnato al whistleblower' })
  token: string;
}
