import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class ResendOwnerInviteDto {
  @ApiProperty({
    description: 'ID del client (tenant) creato al signup pubblico',
    example: 'cmharafcg0001vtzorvdqmas5',
  })
  @IsString()
  @Length(10, 64)
  clientId!: string;

  @ApiProperty({
    description: 'Email dell’owner (se omessa viene usata quella registrata per il tenant)',
    required: false,
    example: 'owner@azienda.it',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
