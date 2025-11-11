import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class MyNoteDto {
  @ApiProperty({ description: 'Testo della nota personale (max ~15KB)', example: 'Appunto privato...', maxLength: 15000 })
  @IsString()
  @MaxLength(15000)
  body!: string;
}

