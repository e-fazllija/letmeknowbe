import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicAuthService } from './public-auth.service';
import { ActivateDto } from './dto/activate.dto';

@ApiTags('public-auth')
@Controller('public/auth')
export class PublicAuthController {
  constructor(private service: PublicAuthService) {}

  @Post('activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Attiva un invito (Owner/Admin/Agent) tramite selector + token' })
  activate(@Body() dto: ActivateDto) {
    return this.service.activate(dto);
  }
}

