import { getPrismaClient } from '../db/prisma-client.js';
import { EventContractDbService } from './event-contract-db-service.js';
import { PrismaEventStore } from './prisma-event-store.js';

export function createPrismaEventService() {
  const prisma = getPrismaClient();
  const store = new PrismaEventStore(prisma);
  return new EventContractDbService({ store });
}
