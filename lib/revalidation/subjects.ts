// F3 do ciclo SN — os ASSUNTOS do barramento de invalidacao (SN-D13).
//
// Um "assunto" e um pedaco do dominio que varias telas exibem. Quem escreve
// publica o assunto que tocou; quem exibe se inscreve nos assuntos que lhe
// interessam. Nenhuma tela precisa saber quem mais mostra o mesmo dado — que
// era exatamente o problema do §2.7 do doc (12 callbacks ad-hoc em 7 arquivos,
// e 5 superficies sem revalidacao nenhuma).

export type RevalidationSubject =
  | 'lotes'
  | 'clientes'
  | 'corretores'
  | 'contratos'
  | 'corretagem'
  | 'relatorios'
  | 'usuarios'
  | 'sessao';

// Caminho da API -> assunto que ELE LITERALMENTE TOCA.
//
// 🔴 Proposital: este mapa e ESTREITO. O leque cruzado (um contrato tambem
// mexe na carteira de corretagem; um lote aparece dentro do contrato) NAO mora
// aqui — mora na inscricao de cada superficie, que lista todos os assuntos que
// lhe importam. Publicador adivinhando quem consome e como o mapa apodrece;
// consumidor declarando o que precisa e verificavel na propria tela.
//
// A chave e o PRIMEIRO segmento do caminho. Quem nao esta aqui nao publica:
// `/auth` (login navega pra fora, logout limpa tudo), `/dashboard`,
// `/contract-lookups`, `/relatorios/stats` (so leitura), `/push` e
// `/print-queue` (nao tem lista na UI).
const SUBJECT_BY_PATH_ROOT: Readonly<Record<string, RevalidationSubject>> = {
  samples: 'lotes',
  classification: 'lotes',
  clients: 'clientes',
  brokers: 'corretores',
  'sale-contracts': 'contratos',
  'approval-labels': 'contratos',
  financeiro: 'corretagem',
  'visit-reports': 'relatorios',
  'weekly-reports': 'relatorios',
  'informe-feed': 'relatorios',
  users: 'usuarios',
};

/**
 * Assunto afetado por uma escrita neste caminho, ou `null` se o caminho nao
 * alimenta nenhuma lista da UI. Aceita o caminho com ou sem query string.
 */
export function subjectForPath(path: string): RevalidationSubject | null {
  const withoutQuery = path.split('?')[0] ?? '';
  const root = withoutQuery.split('/').filter(Boolean)[0];
  if (!root) {
    return null;
  }

  return SUBJECT_BY_PATH_ROOT[root] ?? null;
}
