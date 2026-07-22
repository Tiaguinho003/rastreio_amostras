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
