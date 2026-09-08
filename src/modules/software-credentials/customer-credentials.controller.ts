import { Body, Controller, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SoftwareCredentialsService } from './software-credentials.service.js';
import { allowAttempt, clientKey } from '../../common/rate-limit.js';

/** Comprador: order_id + email de una orden ya pagada. Sin JWT de panel. */
@Controller('api/customer-credentials')
export class CustomerCredentialsController {
  constructor(private readonly service: SoftwareCredentialsService) {}

  @Post()
  listByOrder(@Body() body: any, @Req() req: Request) {
    this.guardRate(req);
    return this.service.customerListByOrder(body);
  }

  @Post('regenerate')
  regenerate(@Body() body: any, @Req() req: Request) {
    this.guardRate(req);
    return this.service.customerRegeneratePassword(body);
  }

  private guardRate(req: Request) {
    const ip = clientKey(req);
    if (!allowAttempt(`customer-creds:${ip}`, 20, 15 * 60 * 1000)) {
      throw new HttpException({ error: 'too_many_attempts' }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
