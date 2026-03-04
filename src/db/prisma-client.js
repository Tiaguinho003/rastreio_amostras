import { PrismaClient } from '@prisma/client';

let prismaSingleton;

export function getPrismaClient() {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient();
  }
  return prismaSingleton;
}
