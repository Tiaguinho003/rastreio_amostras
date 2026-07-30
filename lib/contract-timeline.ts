import type { ContractAgenda, SaleContractStatus } from './types';

// RC-D114: a barra de TEMPO do card de contrato, e a frase ao lado dela.
//
// 🔴 Por que uma barra existe aqui depois de a RC-D82 ter recusado uma: aquela barra
// mediria FASES, e as cinco fases são luzes independentes — nada trava nada, então
// "cheguei até aqui" seria mentira. Esta mede TEMPO, que é monotônico: o dia de hoje
// não volta atrás, e a distância entre a emissão e o pagamento é um fato do
// documento. A barra não afirma que algo foi cumprido; ela afirma quanto do prazo
// passou.
//
// O cálculo é de APRESENTAÇÃO e mora no front de propósito: o servidor já manda os
// três ingredientes (`contractDate`, `paymentDate`, `status`) e a agenda, e derivar
// aqui evita um campo a mais que envelheceria à meia-noite dentro de um payload
// cacheado.

/** Tom da barra. `late` é o único vermelho (RC-D115: o vermelho é do atraso). */
export type ContractTimeTone = 'running' | 'late' | 'done' | 'cancelled';

export interface ContractTimeProgress {
  /** 0..1 = fração do prazo já corrida; `null` = SEM TRILHO (só a frase). */
  pct: number | null;
  tone: ContractTimeTone;
}

const MS_PER_DAY = 86_400_000;

function dayKeyOf(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

/** Dias inteiros de `fromKey` até `toKey` (negativo se `toKey` é anterior). */
export function dayDiff(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00.000Z`);
  const to = Date.parse(`${toKey}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / MS_PER_DAY);
}

/**
 * Quanto do prazo `contractDate → paymentDate` já passou, e em que tom.
 *
 * A ordem dos casos é a leitura do negócio: o que TERMINOU não tem prazo correndo
 * (finalizado e washout enchem a barra), o que venceu está cheio em vermelho, e o
 * que não tem data de pagamento ("À definir", D144) não tem trilho nenhum — desenhar
 * um trilho vazio ali inventaria um prazo que o contrato não tem.
 */
export function contractTimeProgress(
  contract: {
    contractDate: string | null;
    paymentDate: string | null;
    status: SaleContractStatus;
  },
  todayKey: string
): ContractTimeProgress {
  // RC-D115: o washout é laranja, não vermelho — o vermelho ficou reservado ao
  // atraso, que é o único estado que pede ação hoje.
  if (contract.status === 'WASH_OUT') return { pct: 1, tone: 'cancelled' };
  // RC-D84: finalizar significa que o contrato inteiro aconteceu — a barra enche.
  if (contract.status === 'FINALIZADO') return { pct: 1, tone: 'done' };

  const paymentKey = dayKeyOf(contract.paymentDate);
  if (!paymentKey) return { pct: null, tone: 'running' };
  if (todayKey > paymentKey) return { pct: 1, tone: 'late' };

  const contractKey = dayKeyOf(contract.contractDate);
  // Sem data de contrato não há de onde medir; span nulo ou invertido não tem
  // fração a calcular (divisão por zero / negativa). Nos dois casos: só a frase.
  if (!contractKey || contractKey >= paymentKey) return { pct: null, tone: 'running' };

  const span = dayDiff(contractKey, paymentKey);
  const elapsed = dayDiff(contractKey, todayKey);
  const pct = Math.min(1, Math.max(0, elapsed / span));
  return { pct, tone: 'running' };
}

function days(count: number): string {
  return count === 1 ? '1 dia' : `${count} dias`;
}

/**
 * A frase do card: o PRÓXIMO COMPROMISSO em contagem de dias.
 *
 * Mesma agenda do servidor que a coluna "Situação" usava (`contractAgendaLabel`,
 * que segue viva no modal de Detalhes); o que muda é a FORMA — a lista pergunta
 * "quanto falta", não "em que data", e uma data exige do leitor a subtração que a
 * contagem já entrega. As frases são formas VERBAIS ("Fatura em 3 dias", "Venceu há
 * 4 dias") por serem imunes a gênero: o sujeito implícito muda conforme o
 * compromisso (a fatura, o pagamento), e adjetivos concordariam errado em metade
 * dos casos.
 */
export function contractCountdownLabel(agenda: ContractAgenda, todayKey: string): string {
  const when = agenda.dayKey;
  switch (agenda.kind) {
    case 'cancelado':
      return 'Cancelado';
    case 'finalizado':
      return 'Concluído';
    // A aprovação é AÇÃO, não prazo: o `dayKey` dela é a data de faturamento, e
    // "aprovação em 3 dias" leria como se ela vencesse — ela só espera ser enviada.
    case 'aprovacao':
      return 'Aprovação a enviar';
    case 'pagamento_vencido': {
      if (!when) return 'Pagamento vencido';
      const late = dayDiff(when, todayKey);
      return late > 0 ? `Venceu há ${days(late)}` : 'Pagamento vencido';
    }
    case 'faturamento': {
      if (!when) return 'Sem prazo definido';
      const left = dayDiff(todayKey, when);
      return left <= 0 ? 'Fatura hoje' : `Fatura em ${days(left)}`;
    }
    case 'pagamento': {
      if (!when) return 'Sem prazo definido';
      const left = dayDiff(todayKey, when);
      return left <= 0 ? 'Paga hoje' : `Paga em ${days(left)}`;
    }
    default:
      return 'Sem prazo definido';
  }
}
