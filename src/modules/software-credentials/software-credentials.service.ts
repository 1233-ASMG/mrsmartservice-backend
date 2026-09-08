import { BadRequestException, Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { SoftwareCredentialsRepository } from './software-credentials.repository.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';

function randomString(len: number) {
  return crypto.randomBytes(Math.ceil(len * 0.75)).toString('base64url').slice(0, len);
}

function normalizeUsername(u: string) {
  return String(u || '')
    .trim()
    .replace(/\s+/g, '')
    .slice(0, 40);
}

@Injectable()
export class SoftwareCredentialsService {
  constructor(private readonly repo: SoftwareCredentialsRepository, private readonly prisma: PrismaService) {}

  async list(query: any) {
    const softwareId = query?.software_id ?? query?.softwareId;
    const sid = softwareId !== undefined && softwareId !== null && String(softwareId).trim() !== ''
      ? Number(softwareId)
      : null;
    if (sid !== null && !Number.isFinite(sid)) throw new BadRequestException({ error: 'invalid_software_id' });
    return this.repo.list({ softwareId: sid ?? undefined });
  }

  async create(body: any) {
    const softwareId = Number(body?.software_id ?? body?.softwareId);
    if (!Number.isFinite(softwareId) || softwareId <= 0) throw new BadRequestException({ error: 'invalid_software_id' });

    const orderIdRaw = body?.order_id ?? body?.orderId;
    const orderId = orderIdRaw !== undefined && orderIdRaw !== null && String(orderIdRaw).trim() !== ''
      ? Number(orderIdRaw)
      : null;
    if (orderId !== null && (!Number.isFinite(orderId) || orderId <= 0)) {
      throw new BadRequestException({ error: 'invalid_order_id' });
    }

    if (orderId !== null) {
      const exists = await this.prisma.order.findUnique({ where: { orderId }, select: { orderId: true } });
      if (!exists) throw new BadRequestException({ error: 'order_not_found' });
    }

    const wantUser = body?.username ? normalizeUsername(body.username) : '';
    const wantPass = body?.password ? String(body.password).trim() : '';

    let username = wantUser;
    let password = wantPass;

    // Si no vienen, generamos automáticamente (fácil de dictar y copiar)
    if (!username) username = `u${softwareId}-${randomString(6)}`;
    if (!password) password = `${randomString(4)}-${randomString(4)}`;

    if (username.length < 4) throw new BadRequestException({ error: 'username_too_short' });
    if (password.length < 6) throw new BadRequestException({ error: 'password_too_short' });

    const passwordHash = await bcrypt.hash(password, 10);

    const created = await this.repo.create({ softwareId, orderId, username, passwordHash });
    // Devolvemos el password en claro SOLO al crear (para copiar/enviar). No se guarda en claro.
    return {
      ok: true,
      credential_id: created.credentialId,
      software_id: created.softwareId,
      order_id: created.orderId ?? null,
      username: created.username,
      password,
      created_at: created.createdAt,
    };
  }

  async remove(id: number) {
    if (!Number.isFinite(id) || id <= 0) throw new BadRequestException({ error: 'invalid_id' });
    await this.repo.remove(id);
    return { ok: true };
  }

  // -------------------------
  // Público: comprador consulta credenciales por order_id + email
  // -------------------------
  async customerListByOrder(body: any) {
    const orderId = Number(body?.order_id ?? body?.orderId);
    const emailRaw = String(body?.email ?? body?.buyer_email ?? '').trim();
    if (!Number.isFinite(orderId) || orderId <= 0) throw new BadRequestException({ error: 'invalid_order_id' });
    if (!emailRaw || !emailRaw.includes('@')) throw new BadRequestException({ error: 'invalid_email' });

    const email = emailRaw.toLowerCase();
    const order = await this.prisma.order.findUnique({
      where: { orderId },
      select: {
        orderId: true,
        buyerEmail: true,
        payerEmail: true,
        buyerName: true,
        status: true,
        domicilioModo: true,
      },
    });
    if (!order) throw new BadRequestException({ error: 'order_not_found' });

    const buyerEmail = (order.buyerEmail ?? '').toLowerCase();
    const payerEmail = (order.payerEmail ?? '').toLowerCase();
    if (email !== buyerEmail && email !== payerEmail) {
      throw new BadRequestException({ error: 'order_email_mismatch' });
    }
    if (String(order.status || '').toUpperCase() !== 'APPROVED') {
      throw new BadRequestException({ error: 'order_not_paid' });
    }

    const creds = await (this.prisma as any).softwareCredential.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: {
        credentialId: true,
        softwareId: true,
        orderId: true,
        username: true,
        createdAt: true,
        software: { select: { name: true, softwareId: true } },
      },
    });

    return {
      ok: true,
      order_id: order.orderId,
      buyer_name: order.buyerName ?? null,
      status: order.status,
      domicilio_modo: order.domicilioModo ?? null,
      credentials: creds.map((c) => ({
        credential_id: c.credentialId,
        software_id: c.softwareId,
        software_name: c.software?.name ?? null,
        order_id: c.orderId,
        username: c.username,
        created_at: c.createdAt?.toISOString?.() ?? String(c.createdAt),
      })),
    };
  }

  async customerRegeneratePassword(body: any) {
    const orderId = Number(body?.order_id ?? body?.orderId);
    const credentialId = Number(body?.credential_id ?? body?.credentialId);
    const emailRaw = String(body?.email ?? '').trim();
    if (!Number.isFinite(orderId) || orderId <= 0) throw new BadRequestException({ error: 'invalid_order_id' });
    if (!Number.isFinite(credentialId) || credentialId <= 0) throw new BadRequestException({ error: 'invalid_credential_id' });
    if (!emailRaw || !emailRaw.includes('@')) throw new BadRequestException({ error: 'invalid_email' });
    const email = emailRaw.toLowerCase();

    const order = await this.prisma.order.findUnique({
      where: { orderId },
      select: { orderId: true, buyerEmail: true, payerEmail: true, status: true },
    });
    if (!order) throw new BadRequestException({ error: 'order_not_found' });
    const buyerEmail = (order.buyerEmail ?? '').toLowerCase();
    const payerEmail = (order.payerEmail ?? '').toLowerCase();
    if (email !== buyerEmail && email !== payerEmail) throw new BadRequestException({ error: 'order_email_mismatch' });
    if (String(order.status || '').toUpperCase() !== 'APPROVED') {
      throw new BadRequestException({ error: 'order_not_paid' });
    }

    const cred = await (this.prisma as any).softwareCredential.findUnique({
      where: { credentialId },
      select: { credentialId: true, orderId: true, softwareId: true, username: true },
    });
    if (!cred || cred.orderId !== orderId) throw new BadRequestException({ error: 'credential_not_found' });

    const password = `${randomString(4)}-${randomString(4)}`;
    const passwordHash = await bcrypt.hash(password, 10);
    await this.repo.updatePassword({ credentialId, passwordHash });

    return {
      ok: true,
      order_id: orderId,
      credential_id: credentialId,
      software_id: cred.softwareId,
      username: cred.username,
      password,
    };
  }
}
