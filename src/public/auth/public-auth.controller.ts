import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicAuthService } from './public-auth.service';
import { ActivateDto } from './dto/activate.dto';
import { ResendOwnerInviteDto } from './dto/resend-owner-invite.dto';
import { ChangeOwnerEmailDto } from './dto/change-owner-email.dto';

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

  @Post('resend-owner-invite')
  @HttpCode(200)
  @ApiOperation({ summary: "Reinvia l'email di invito per l'owner (signup pubblico)" })
  resendOwnerInvite(@Body() dto: ResendOwnerInviteDto) {
    return this.service.resendOwnerInvite(dto);
  }

  @Post('change-owner-email')
  @HttpCode(200)
  @ApiOperation({ summary: "Aggiorna l'email dell'owner (stato INVITED) e reinvia il link di attivazione" })
  changeOwnerEmail(@Body() dto: ChangeOwnerEmailDto) {
    return this.service.changeOwnerEmail(dto);
  }
}
