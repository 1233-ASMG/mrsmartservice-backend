import { Controller, Get } from '@nestjs/common';

@Controller()
export class DiagnosticsController {
  @Get('/')
  root() {
    return 'mrsmartservice API OK';
  }

  @Get('api/health')
  health() {
    return { ok: true };
  }
}
