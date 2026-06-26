// Fechamento (Fase B.2): a venda a vista passou a exigir os termos do contrato
// (preco/saca, corretagens %, >=1 corretor). Estes fixtures deixam as vendas
// dos testes de integracao existentes validas sem repetir os mesmos campos em
// cada chamada (spread de SALE_CONTRACT_TEST_FIELDS em `movementType: 'SALE'`).
//
// O broker tem id fixo e e semeado no beforeEach. resetDatabase() trunca
// sample_movement CASCADE (cascata limpa sale_contract/sale_contract_broker),
// mas NAO a tabela broker — entao o broker sobrevive; o upsert e idempotente.

export const TEST_BROKER_ID = '0000b0c0-0000-4000-8000-00000000b0c0';

export const SALE_CONTRACT_TEST_FIELDS = Object.freeze({
  unitPrice: 100,
  sellerBrokeragePct: 0,
  buyerBrokeragePct: 0,
  brokerIds: [TEST_BROKER_ID],
});

export async function seedTestBroker(prisma, id = TEST_BROKER_ID) {
  await prisma.broker.upsert({
    where: { id },
    update: { status: 'ACTIVE' },
    create: { id, name: 'Corretor Teste', status: 'ACTIVE' },
  });
  return id;
}
