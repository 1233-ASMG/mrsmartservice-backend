import 'reflect-metadata';
import 'dotenv/config';

// Cloud Run / Neon: si la URL está en la variable DB en lugar de DATABASE_URL, usarla igual
let dbEnvSource = 'DATABASE_URL';
if (!process.env.DATABASE_URL && process.env.DB) {
  process.env.DATABASE_URL = process.env.DB;
  dbEnvSource = 'DB';
}

import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';

function has(v: any) {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Extrae host de DATABASE_URL para log (nunca loguear URL completa). */
function getDbHostForLog(): { source: string; host: string; isNeon: boolean; hasSsl: boolean } {
  const url = process.env.DATABASE_URL;
  const source = dbEnvSource;
  if (!url || typeof url !== 'string') {
    return { source, host: '(no definida)', isNeon: false, hasSsl: false };
  }
  try {
    const u = new URL(url);
    const host = u.hostname || '(vacío)';
    const isNeon = host.includes('neon.tech');
    const hasSsl = u.searchParams.has('sslmode') || url.toLowerCase().includes('sslmode=require');
    return { source, host, isNeon, hasSsl };
  } catch {
    return { source, host: '(URL inválida)', isNeon: false, hasSsl: false };
  }
}

function toOrigin(url: string | undefined) {
  try {
    if (!has(url)) return null;
    const u = new URL(url!);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: false,
    logger: ['log', 'error', 'warn'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );


  const allowedOrigins = [
    toOrigin(process.env.FRONT_URL),
    'https://mrsmartservice-front-next.vercel.app',
    'https://mrsmartservice-decad.web.app',
    'https://mrsmartservice-decad.firebaseapp.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin, cb) => {
      // Webhooks de MP, curl y health checks no mandan Origin.
      if (!origin) return cb(null, true);

      const vercelOk = /^https:\/\/mrsmartservice-front-next(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin);
      if (vercelOk) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);

      // En local se permite cualquier origen; en producción solo la lista de arriba.
      if (process.env.NODE_ENV !== 'production') return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const expressApp = app.getHttpAdapter().getInstance();

  // Límite para JSON (compat con el legacy)
  expressApp.use(express.json({ limit: '1mb' }));

  // Servir uploads locales
  expressApp.use('/uploads', express.static('uploads'));



  const port = Number(process.env.PORT || 8080);
  await app.listen(port, '0.0.0.0');
  console.log(`API (Nest) running on port ${port}`);

  const dbLog = getDbHostForLog();
  console.log(`DB: ${dbLog.source} → host=${dbLog.host} | neon.tech=${dbLog.isNeon} | ssl=${dbLog.hasSsl}`);
  if (dbLog.host === '(no definida)' || dbLog.host === '(vacío)') {
    console.warn('DB: Ninguna URL de BD definida; en Cloud Run definir DATABASE_URL o DB con la URL de Neon (neon.tech).');
  }
  if (dbLog.host.includes('localhost') || dbLog.host === '127.0.0.1') {
    console.warn('DB: Se está usando localhost; en Cloud Run debe usarse DATABASE_URL de Neon (neon.tech).');
  }
}

bootstrap().catch((e) => {
  console.error('Fatal bootstrap error:', e);
  process.exit(1);
});
