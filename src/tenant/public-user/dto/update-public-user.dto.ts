import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePublicUserDto {
  @ApiPropertyOptional()
  clientId?: string;

  @ApiPropertyOptional()
  reportId?: string;

  @ApiPropertyOptional()
  token?: string;
}
