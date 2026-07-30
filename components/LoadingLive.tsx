'use client';

// Regiao `aria-live` do carregamento incremental (F4 do ciclo SN, SN-D10).
// Sem ela a rolagem infinita traz conteudo EM SILENCIO pro leitor de tela: o
// esqueleto e `aria-hidden`, os cards novos entram no fim da lista e nada e
// anunciado. So a /samples tinha essa regiao; agora e peca das seis listas.
//
// 🔴 A regiao tem que estar SEMPRE no DOM, com so o TEXTO mudando. Se ela
// montar junto com o esqueleto (dentro do `SkeletonCards`, por exemplo), parte
// dos leitores de tela nao anuncia — regiao recem-inserida costuma nao
// disparar. Por isso sao duas pecas, e nao uma.
//
// O SUBSTANTIVO entra aqui, e so aqui: o leitor ouve a frase sem o contexto
// visual da tela ("Carregando mais lotes"). No texto visivel a regra e a
// oposta — "Carregando…" seco, porque a tela ja diz do que se trata.

export function LoadingLive({ active, label }: { active: boolean; label: string }) {
  return (
    <div role="status" aria-live="polite" className="fv-visually-hidden">
      {active ? `Carregando ${label}` : ''}
    </div>
  );
}
