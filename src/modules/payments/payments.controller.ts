import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { CreatePreferenceUseCase } from './application/usecases/create-preference.usecase.js';
import { HandleWebhookUseCase } from './application/usecases/handle-webhook.usecase.js';
import { ConfirmPaymentUseCase } from './application/usecases/confirm-payment.usecase.js';

@Controller('api/payments')
export class PaymentsController {
  constructor(
    private readonly createPrefUC: CreatePreferenceUseCase,
    private readonly webhookUC: HandleWebhookUseCase,
    private readonly confirmUC: ConfirmPaymentUseCase,
  ) {}

  @Post('create')
  async create(@Body() dto: CreatePaymentDto, @Req() req: Request) {
    return this.createPrefUC.execute(dto, req);
  }

  // Mercado Pago reintenta si no recibe 200.
  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: Request) {
    return this.webhookUC.execute(req);
  }

  @Post('confirm')
  async confirm(@Body() body: any, @Req() req: Request) {
    return this.confirmUC.execute(body, req);
  }
}
