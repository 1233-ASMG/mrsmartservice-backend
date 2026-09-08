import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';

function envFlag(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const s = String(raw).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async onApplicationBootstrap() {
    await this.seedPanelUsersIfNeeded().catch((e: any) =>
      console.error('Error en seed de usuarios de panel:', e?.message || e),
    );
  }

  /**
   * Solo desarrollo/test: crea usuarios de panel si no existen.
   * En producción no se ejecuta (evita contraseñas conocidas en un repo público).
   * Nunca pisa el hash de un usuario que ya está en la base.
   */
  private async seedPanelUsersIfNeeded() {
    const allowSeed =
      process.env.NODE_ENV !== 'production' && envFlag('SEED_DEFAULT_USERS', true);
    if (!allowSeed) return;

    const anyDb: any = this.db as any;
    if (!anyDb.user?.upsert) {
      console.warn('Seed de panel omitido: PrismaClient sin modelo User');
      return;
    }

    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@tienda.com';
    const adminPass = process.env.SEED_ADMIN_PASSWORD || 'Admin12345!';
    const devEmail = process.env.SEED_DEV_EMAIL || 'dev@tienda.com';
    const devPass = process.env.SEED_DEV_PASSWORD || 'Dev12345!';
    const contadorEmail = process.env.SEED_CONTADOR_EMAIL || 'contador@tienda.com';
    const contadorPass = process.env.SEED_CONTADOR_PASSWORD || 'Contador123!';

    await this.db.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: { email: adminEmail, passwordHash: bcrypt.hashSync(adminPass, 10), role: 'ADMIN' },
    });
    await this.db.user.upsert({
      where: { email: devEmail },
      update: {},
      create: { email: devEmail, passwordHash: bcrypt.hashSync(devPass, 10), role: 'DEV_ADMIN' },
    });
    await this.db.user.upsert({
      where: { email: contadorEmail },
      update: {},
      create: { email: contadorEmail, passwordHash: bcrypt.hashSync(contadorPass, 10), role: 'CONTADOR' },
    });
  }
}
