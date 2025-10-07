// import { ApiProperty } from '@nestjs/swagger';
// import { IsEnum, IsOptional, IsString } from 'class-validator';
// import { ReportStatus, ReportChannel } from '../../../generated/tenant';


// export class CreateReportDto {
//   @ApiProperty()
//   @IsString()
//   clientId!: string;

//   @ApiProperty()
//   @IsString()
//   title!: string;

//   @ApiProperty({ required: false })
//   @IsOptional()
//   @IsString()
//   summary?: string;

//   @ApiProperty({ enum: ReportStatus })
//   @IsOptional()
//   @IsEnum(ReportStatus)
//   status?: ReportStatus;

//   @ApiProperty({ enum: ReportChannel })
//   @IsOptional()
//   @IsEnum(ReportChannel)
//   channel?: ReportChannel;
// }
 
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateReportDto {
  @ApiProperty({
    description: 'ID del cliente (azienda) a cui appartiene la segnalazione',
  })
  @IsString()
  clientId!: string;

  @ApiProperty({
    description: 'Tipo di segnalazione (es. Sicurezza, Etica, Frode, ecc.)',
  })
  @IsString()
  tipoSegnalazione!: string;

  @ApiProperty({
    description: 'Ufficio o area aziendale interessata dalla segnalazione',
  })
  @IsString()
  ufficio!: string;

  @ApiProperty({
    description: 'Testo della segnalazione (contenuto della denuncia)',
  })
  @IsString()
  segnalazione!: string;

  @ApiProperty({
    description: 'Canale della segnalazione (es. WEB, EMAIL, PHONE)',
    default: 'WEB',
  })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiProperty({
    description: 'Stato iniziale del report',
    default: 'OPEN',
  })
  @IsOptional()
  @IsString()
  status?: string;
}
