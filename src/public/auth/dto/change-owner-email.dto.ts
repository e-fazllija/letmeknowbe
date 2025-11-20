import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length } from 'class-validator';

export class ChangeOwnerEmailDto {
  @ApiProperty({
    description: 'ID del client (tenant) creato al signup pubblico',
    example: 'cmharafcg0001vtzorvdqmas5',
  })
  @IsString()
  @Length(10, 64)
  clientId!: string;

  @ApiProperty({
    description: "Nuovo indirizzo email dell'owner (account in stato INVITED)",
    example: 'nuovo-owner@azienda.it',
  })
  @IsEmail()
  newEmail!: string;
}
