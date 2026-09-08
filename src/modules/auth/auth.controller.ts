import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { LoginDto } from './dto/login.dto.js';
import { RequestResetDto } from './dto/request-reset.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { Roles } from './guards/roles.decorator.js';
import { LoginUseCase } from './application/usecases/login.usecase.js';
import { GetMeUseCase } from './application/usecases/get-me.usecase.js';
import { RequestPasswordResetUseCase } from './application/usecases/request-password-reset.usecase.js';
import { ResetPasswordUseCase } from './application/usecases/reset-password.usecase.js';
import { ChangePasswordUseCase } from './application/usecases/change-password.usecase.js';
import { allowAttempt, clientKey } from '../../common/rate-limit.js';

@Controller()
export class AuthController {
  constructor(
    private readonly loginUC: LoginUseCase,
    private readonly meUC: GetMeUseCase,
    private readonly requestResetUC: RequestPasswordResetUseCase,
    private readonly resetPasswordUC: ResetPasswordUseCase,
    private readonly changePasswordUC: ChangePasswordUseCase,
  ) {}

  @Post('api/login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = clientKey(req);
    if (!allowAttempt(`login:${ip}`, 20, 15 * 60 * 1000)) {
      throw new HttpException({ error: 'too_many_attempts' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    const email = String(dto.email || '').trim().toLowerCase();
    if (email && !allowAttempt(`login-email:${email}`, 10, 15 * 60 * 1000)) {
      throw new HttpException({ error: 'too_many_attempts' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.loginUC.execute(dto.email, dto.password);
  }

@Controller()
export class AuthController {
  constructor(
    private readonly loginUC: LoginUseCase,
    private readonly meUC: GetMeUseCase,
    private readonly requestResetUC: RequestPasswordResetUseCase,
    private readonly resetPasswordUC: ResetPasswordUseCase,
    private readonly changePasswordUC: ChangePasswordUseCase,
  ) {}

  @Post('api/login')
  login(@Body() dto: LoginDto) {
    return this.loginUC.execute(dto.email, dto.password);
  }

  @Post('api/auth/request-reset')
  requestReset(@Body() dto: RequestResetDto) {
    return this.requestResetUC.execute(dto.email);
  }

  @Post('api/auth/reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.resetPasswordUC.execute(dto.token, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('api/me')
  async me(@Req() req: any) {
    const userId = Number(req.user?.user_id ?? req.user?.sub);
    return this.meUC.execute(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'DEV_ADMIN', 'STAFF', 'CONTADOR')
  @Post('api/users/change-password')
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const userId = Number(req.user?.user_id ?? req.user?.sub);
    return this.changePasswordUC.execute(userId, dto.oldPassword, dto.newPassword);
  }
}
