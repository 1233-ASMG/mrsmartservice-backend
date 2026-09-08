import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { MpClientService } from './infrastructure/mp-client.service.js';
import { CreatePreferenceUseCase } from './application/usecases/create-preference.usecase.js';
import { ConfirmPaymentUseCase } from './application/usecases/confirm-payment.usecase.js';
import { HandleWebhookUseCase } from './application/usecases/handle-webhook.usecase.js';
import { SettleMercadoPagoPaymentUseCase } from './application/usecases/settle-mercadopago-payment.usecase.js';

@Module({
  controllers: [PaymentsController],
  providers: [
    MpClientService,
    CreatePreferenceUseCase,
    ConfirmPaymentUseCase,
    HandleWebhookUseCase,
    SettleMercadoPagoPaymentUseCase,
  ],
  exports: [MpClientService],
})
export class PaymentsModule {}
