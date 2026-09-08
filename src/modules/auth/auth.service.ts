/**
 * Legado: no está cableado en AuthModule.
 * El login del panel vive en application/usecases/login.usecase.ts
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_REPOSITORY, type AuthRepositoryPort } from './domain/auth-repository.port.js';

function trimRightSlash(u: string) {
  return (u || '').trim().replace(/\/+$/, '');
}

function resolveFrontBase() {
  const env = trimRightSlash(String(process.env.FRONT_URL || ''));
  if (env) return env;

  return process.env.NODE_ENV === 'production'
    ? 'https://mrsmartservice-decad.web.app'
    : 'http://localhost:3000';
}

@Injectable()
export class AuthService {
  constructor(@Inject(AUTH_REPOSITORY) private readonly repo: AuthRepositoryPort) {}

  async login(email: string, password: string) {
    if (!email || !password) return { error: 'missing_credentials' };

    const user = await this.repo.findByEmail(email);
    if (!user) return { error: 'invalid_credentials' };

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return { error: 'invalid_credentials' };

    if (!process.env.JWT_SECRET) return { error: 'server_config_error' };

    const payload = { sub: user.userId, user_id: user.userId, email: user.email, role: user.role };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
    return { token, role: user.role, email: user.email };
  }

  async me(userId: number) {
    const p = await this.repo.getProfile(userId);
    if (!p) return null;
    // compat con front legacy (snake_case)
    return { user_id: p.userId, email: p.email, role: p.role, created_at: p.createdAt };
  }

  async requestReset(email: string) {
    if (!email) return { error: 'email_required' };

    const user = await this.repo.findByEmail(email);
    if (!user) return { ok: true };

    const roleUpper = String(user.role || '').toUpperCase();
    if (!['ADMIN', 'DEV_ADMIN'].includes(roleUpper)) return { ok: true };

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

    await this.repo.createPasswordReset(Number(user.userId), token, expiresAt);

    const resetUrl = `${resolveFrontBase()}/reset-password.html?token=${token}`;
    const isDev = String(process.env.NODE_ENV || '').toLowerCase() !== 'production';

    const hasSMTP = !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
    const allowResetUrl = String(process.env.ALLOW_RESET_URL_IN_RESPONSE || '').toLowerCase() === 'true';

    // Si NO hay SMTP configurado:
    // - En dev (o si se habilita ALLOW_RESET_URL_IN_RESPONSE=true) devolvemos el link para pruebas.
    // - En prod, devolvemos un error claro para que el admin configure SMTP.
    if (!hasSMTP) {
      if (isDev || allowResetUrl) return { ok: true, resetUrl };
      return { ok: false, error: 'smtp_not_configured' };
    }

    if (hasSMTP) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });

      await transporter.sendMail({
        from: `"MR SmartService" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Recupera tu contraseña - MR SmartService',
        html: `<p>Usa este link:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      });
    }

    return { ok: true };
  }

  async resetPassword(token: string, password: string) {
    if (!token || !password) return { error: 'bad_request' };
    if (password.length < 8) return { error: 'weak_password' };

    const row = await this.repo.findPasswordResetByToken(token);
    if (!row) return { error: 'invalid_token' };

    const expired = new Date(row.expiresAt) < new Date();
    if (row.used || expired) return { error: 'expired_token' };

    const hash = await bcrypt.hash(password, 10);
    await this.repo.updateUserPassword(Number(row.userId), hash);
    await this.repo.markPasswordResetUsed(Number(row.id));
    return { ok: true };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    if (!oldPassword || !newPassword) return { error: 'missing_fields' };
    if (newPassword.length < 8) return { error: 'weak_password' };

    const u = await this.repo.getUserAuth(userId);
    if (!u) return { error: 'user_not_found' };

    const ok = await bcrypt.compare(oldPassword, u.passwordHash);
    if (!ok) return { error: 'invalid_password' };

    const newHash = await bcrypt.hash(newPassword, 10);
    await this.repo.updateUserPassword(userId, newHash);
    return { success: true };
  }
}
