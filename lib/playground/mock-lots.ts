import type {
  ClassificationDataPayload,
  ClassificationPeneirasPayload,
} from '../classification-form';
import type { SampleSnapshot } from '../types';

// Lotes MOCKADOS do protótipo do Playground — no contrato REAL
// (SampleSnapshot + ClassificationDataPayload), para que a troca pela busca
// real (F2) seja só de fonte, sem tocar em nenhum componente do canvas.
// Todos elegíveis por PG9: status CLASSIFIED + availableSacks > 0.
// Variedade deliberada: ficha completa, ficha com nulls, defeitos em texto
// não-interpretável ("8-9", "<1", "1/2"), saldos 3–120, safras distintas,
// donos iguais/distintos/ausentes e uma liga real (isBlend) como origem.

const OWNER_JOAO = { id: 'mock-client-joao', name: 'João Silva' };
const OWNER_MARIA = { id: 'mock-client-maria', name: 'Maria Santos' };
const OWNER_PEDRO = { id: 'mock-client-pedro', name: 'Pedro Rocha' };

const EMPTY_PENEIRAS: ClassificationPeneirasPayload = {
  p18: null,
  p17: null,
  p16: null,
  p15: null,
  p14: null,
  p13: null,
  p12: null,
  p11: null,
  p10: null,
  mk: null,
};

const EMPTY_DATA: ClassificationDataPayload = {
  dataClassificacao: null,
  padrao: null,
  aspecto: null,
  certif: null,
  catacao: null,
  observacoes: null,
  bebida: null,
  peneiras: null,
  fundos: null,
  defeitos: null,
};

type MockLotSeed = {
  id: string;
  lot: string;
  type: SampleSnapshot['classificationType'];
  owner: { id: string; name: string } | null;
  harvest: string;
  declaredSacks: number;
  soldSacks?: number;
  isBlend?: boolean;
  // Partial<> e raso: peneiras aceita subconjunto e o makeMockLot completa
  // com nulls (o payload real exige as 10 chaves).
  data: Omit<Partial<ClassificationDataPayload>, 'peneiras'> & {
    peneiras?: Partial<ClassificationPeneirasPayload>;
  };
};

function makeMockLot(seed: MockLotSeed): SampleSnapshot {
  const soldSacks = seed.soldSacks ?? 0;
  return {
    id: seed.id,
    internalLotNumber: seed.lot,
    classificationType: seed.type,
    status: 'CLASSIFIED',
    commercialStatus: soldSacks > 0 ? 'PARTIALLY_SOLD' : 'OPEN',
    version: 3,
    lastEventSequence: 5,
    ownerClientId: seed.owner?.id ?? null,
    isBlend: seed.isBlend ?? false,
    declared: {
      owner: seed.owner?.name ?? null,
      sacks: seed.declaredSacks,
      harvest: seed.harvest,
      originLot: null,
      location: null,
    },
    soldSacks,
    lostSacks: 0,
    availableSacks: Math.max(0, seed.declaredSacks - soldSacks),
    latestClassification: {
      version: 1,
      data: {
        ...EMPTY_DATA,
        ...seed.data,
        peneiras: seed.data.peneiras ? { ...EMPTY_PENEIRAS, ...seed.data.peneiras } : null,
      },
    },
    createdAt: '2026-06-10T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
  };
}

export const MOCK_LOTS: SampleSnapshot[] = [
  // Ficha completa, dono João, safra 24/25, saldo grande.
  makeMockLot({
    id: 'mock-5658',
    lot: '5658',
    type: 'BICA',
    owner: OWNER_JOAO,
    harvest: '24/25',
    declaredSacks: 140,
    soldSacks: 20,
    data: {
      dataClassificacao: '2026-06-20',
      padrao: 'L4-P3',
      aspecto: 'GC',
      bebida: 'DURA',
      catacao: '0,5',
      peneiras: {
        p18: 4,
        p17: 9,
        p16: 38,
        p15: 22,
        p14: 12,
        p13: 6,
        p12: 3,
        p11: 1,
        p10: 1,
        mk: 4,
      },
      fundos: [
        { peneira: '13', percentual: 6 },
        { peneira: null, percentual: null },
      ],
      defeitos: { imp: '1,2', pva: '2', broca: '0,8', gpi: '1', ap: '70', defeito: null },
    },
  }),
  // Ficha PARCIAL (peneiras/catação com nulls), mesmo dono do 5658.
  makeMockLot({
    id: 'mock-5661',
    lot: '5661',
    type: 'BICA',
    owner: OWNER_JOAO,
    harvest: '24/25',
    declaredSacks: 15,
    data: {
      dataClassificacao: '2026-06-24',
      padrao: 'L5-P4',
      bebida: 'DURA',
      peneiras: { p16: 35, p15: 30, mk: 8 },
      defeitos: { imp: '2', pva: null, broca: null, gpi: null, ap: null, defeito: null },
    },
  }),
  // Defeitos em TEXTO não-interpretável (motor real cairia em composição).
  makeMockLot({
    id: 'mock-5664',
    lot: '5664',
    type: 'PREPARADO',
    owner: OWNER_MARIA,
    harvest: '25/26',
    declaredSacks: 40,
    data: {
      dataClassificacao: '2026-06-28',
      aspecto: 'BV',
      bebida: 'MOLE',
      catacao: '<1',
      peneiras: { p17: 6, p16: 30, p15: 28, p14: 18, p13: 10, mk: 6 },
      defeitos: { imp: '8-9', pva: '1/2', broca: null, gpi: null, ap: null, defeito: '8' },
    },
  }),
  // Saldo pequeno (3 sc) e safra antiga; sem dono (carteira da corretora).
  makeMockLot({
    id: 'mock-5667',
    lot: '5667',
    type: 'BAIXO',
    owner: null,
    harvest: '23/24',
    declaredSacks: 10,
    soldSacks: 7,
    data: {
      dataClassificacao: '2026-05-30',
      bebida: 'RIADA',
      catacao: '3',
      peneiras: { p14: 20, p13: 25, p12: 22, p11: 12, p10: 8, mk: 13 },
      defeitos: { imp: '6', pva: '9', broca: '4', gpi: null, ap: '45', defeito: null },
    },
  }),
  // LIGA real (isBlend) como origem: safra composta, sem dono.
  makeMockLot({
    id: 'mock-5670',
    lot: '5670',
    type: 'BICA',
    owner: null,
    harvest: '24/25, 25/26',
    declaredSacks: 25,
    isBlend: true,
    data: {
      dataClassificacao: '2026-07-02',
      padrao: 'L4-P4',
      aspecto: 'GC',
      bebida: 'DURA',
      catacao: '0,7',
      peneiras: { p17: 7, p16: 33, p15: 26, p14: 15, p13: 8, mk: 6 },
      defeitos: { imp: '1,8', pva: '3', broca: '1', gpi: null, ap: '65', defeito: null },
    },
  }),
  // CONILON, dono Maria, safra 25/26.
  makeMockLot({
    id: 'mock-5672',
    lot: '5672',
    type: 'CONILON',
    owner: OWNER_MARIA,
    harvest: '25/26',
    declaredSacks: 60,
    data: {
      dataClassificacao: '2026-07-05',
      bebida: 'DURA',
      catacao: '1,5',
      peneiras: { p16: 12, p15: 24, p14: 28, p13: 20, p12: 9, mk: 7 },
      defeitos: { imp: '4', pva: '6', broca: '2,5', gpi: '2', ap: '55', defeito: null },
    },
  }),
  // Classificada mas com ficha quase VAZIA (edge case de campos 'empty').
  makeMockLot({
    id: 'mock-5675',
    lot: '5675',
    type: 'ESCOLHA',
    owner: OWNER_PEDRO,
    harvest: '24/25',
    declaredSacks: 10,
    data: {
      dataClassificacao: '2026-07-08',
    },
  }),
  // BICA graúda, certificada, dono Pedro.
  makeMockLot({
    id: 'mock-5678',
    lot: '5678',
    type: 'BICA',
    owner: OWNER_PEDRO,
    harvest: '24/25',
    declaredSacks: 80,
    data: {
      dataClassificacao: '2026-07-10',
      padrao: 'L3-P2',
      aspecto: 'GC',
      bebida: 'MOLE',
      certif: 'RA',
      catacao: '0,8',
      peneiras: { p18: 15, p17: 25, p16: 30, p15: 16, p14: 8, p13: 3, mk: 3 },
      defeitos: { imp: '0,5', pva: '1', broca: '0,4', gpi: '0,6', ap: '78', defeito: null },
    },
  }),
];

export const mockLotIndex: ReadonlyMap<string, SampleSnapshot> = new Map(
  MOCK_LOTS.map((lot) => [lot.id, lot])
);

/**
 * Busca do picker do node Lote (PG30) sobre os mocks — mesma assinatura da
 * busca real futura (número do lote por prefixo, dono por substring).
 */
export function searchMockLots(term: string): SampleSnapshot[] {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return MOCK_LOTS;
  return MOCK_LOTS.filter((lot) => {
    const byNumber = (lot.internalLotNumber ?? '').toLowerCase().startsWith(normalized);
    const byOwner = (lot.declared.owner ?? '').toLowerCase().includes(normalized);
    return byNumber || byOwner;
  });
}
