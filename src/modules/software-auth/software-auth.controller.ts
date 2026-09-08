import { Body, Controller, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SoftwareAuthService } from './software-auth.service.js';
import { allowAttempt, clientKey } from '../../common/rate-limit.js';

/**
 * Login del software offline (el comprador no tiene JWT del panel).
 */
@Controller('api/software-auth')
export class SoftwareAuthController {
  constructor(private readonly service: SoftwareAuthService) {}

  @Post('login')
  login(@Body() body: any, @Req() req: Request) {
    this.guardRate(req);
    return this.service.login(body);
  }

  @Post('change-password')
  changePassword(@Body() body: any, @Req() req: Request) {
    this.guardRate(req);
    return this.service.changePassword(body);
  }

  private guardRate(req: Request) {
    const ip = clientKey(req);
    if (!allowAttempt(`software-auth:${ip}`, 30, 15 * 60 * 1000)) {
      throw new HttpException({ error: 'too_many_attempts' }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
