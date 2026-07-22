// Rotulos de exibicao de um lote, compartilhados entre o detalhe
// (SampleDetailView) e as superficies que mostram os mesmos dados fora dele
// (hoje o painel de impressao de etiqueta, que a LISTA tambem abre).
//
// Tipagem ESTRUTURAL de proposito: o detalhe passa o `SampleDetailResponse
// ['sample']` e a lista passa o item da listagem — os dois carregam os
// campos abaixo, e nenhum dos dois precisa saber do outro.

export type SampleOwnerDisplaySource = {
  isBlend?: boolean;
  blendOwnerPinned?: boolean;
  ownerClientId?: string | null;
  declared: { owner: string | null };
};

export function buildReadableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim() ? value : '';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

// Liga (dono fixado): uma liga fixada como "carteira da corretora"
// (blendOwnerPinned + owner null) mostra o rotulo em vez de vazio; os demais
// casos caem no nome do dono.
export function ownerDisplayValue(sample: SampleOwnerDisplaySource): string {
  if (sample.isBlend && sample.blendOwnerPinned && !sample.ownerClientId) {
    return 'Carteira da corretora';
  }
  return buildReadableValue(sample.declared.owner);
}

export type SampleStatusDisplaySource = {
  status: string;
  commercialStatus?: string | null;
};

export type SampleStatusDisplay = {
  /** Rotulo curto do chip. */
  label: string;
  /** Variante do `.fv-chip` do kit institucional. */
  chip: 'fv-chip-gray' | 'fv-chip-red' | 'fv-chip-green' | 'fv-chip-blue';
  /** Modificador do card da lista: pinta a barra lateral e o esmaecimento. */
  modifier: 'is-card-invalid' | 'is-card-sold' | 'is-card-lost' | 'is-card-open';
  isInvalidated: boolean;
};

// FONTE UNICA do status comercial de um lote — LISTA e DETALHE.
//
// A regra ja viveu em quatro lugares e nao batia. Primeiro o M2 juntou a tabela
// e o card, que divergiam entre si; sobrava a lista discordando do DRAWER do
// mesmo lote — "Em aberto" era verde na lista e AZUL no detalhe, "Vendido" era
// cinza na lista e VERDE no detalhe. Quem cedeu foi a lista: azul le como "em
// andamento" e verde como "concluido", e o painel de movimentacoes ja usava
// essa leitura. Hoje `SampleDetailView` chama esta funcao.
//
// PARTIALLY_SOLD cai em "Em aberto" de proposito: o lote parcialmente vendido
// segue disponivel. Quem separa os dois e o resumo comercial
// (`SampleMovementsPanel`), que tem vocabulario proprio ("Disponivel",
// "Parcial") e por isso nao passa por aqui.
//
// "Deletar lote" invalida: deletados somem das listas, mas o rotulo sobrevive
// pros contextos residuais (detalhe por URL). Status interno segue INVALIDATED.
export function sampleStatusDisplay(sample: SampleStatusDisplaySource): SampleStatusDisplay {
  if (sample.status === 'INVALIDATED') {
    return {
      label: 'Deletado',
      chip: 'fv-chip-gray',
      modifier: 'is-card-invalid',
      isInvalidated: true,
    };
  }
  if (sample.commercialStatus === 'SOLD') {
    return {
      label: 'Vendido',
      chip: 'fv-chip-green',
      modifier: 'is-card-sold',
      isInvalidated: false,
    };
  }
  if (sample.commercialStatus === 'LOST') {
    return {
      label: 'Perdido',
      chip: 'fv-chip-red',
      modifier: 'is-card-lost',
      isInvalidated: false,
    };
  }
  return {
    label: 'Em aberto',
    chip: 'fv-chip-blue',
    modifier: 'is-card-open',
    isInvalidated: false,
  };
}
