// F4 do ciclo SN — SN-D11: o sinal de "a navegacao comecou".
//
// Modulo singleton sem React, no molde do barramento da F3
// (`lib/revalidation/bus.ts`): quem SABE que uma navegacao esta em curso e cada
// `<Link>` (via `LinkPendingProbe`), e quem PRECISA saber e uma barra so, no
// shell. Um store no meio evita passar callback por prop pelos ~15 links de
// navegacao ou criar um contexto que re-renderiza o shell inteiro.
//
// O caso que ele resolve: nao existe nenhum `loading.tsx` no projeto e o
// service worker e network-first inclusive pros chunks de rota, entao em rede
// lenta o primeiro toque em cada aba da sessao deixa a TELA ANTERIOR no lugar,
// sem sinal nenhum de que algo esta acontecendo.
//
// Formato de `useSyncExternalStore` de proposito: e o hook que o React ja da
// pra ler store externo sem tearing.

type Listener = () => void;

const listeners = new Set<Listener>();

// Um `<Link>` pode virar pendente enquanto outro ainda nao limpou (toque duplo,
// hover-prefetch em desktop). Por isso e um CONJUNTO de ids, nao um booleano:
// a barra so apaga quando o ULTIMO link pendente terminar.
const pendingLinks = new Set<string>();

let snapshot = false;

function notify(): void {
  const next = pendingLinks.size > 0;
  if (next === snapshot) {
    return;
  }
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Chamado pelo `LinkPendingProbe` de cada `<Link>` de navegacao. */
export function setLinkPending(id: string, pending: boolean): void {
  if (pending) {
    pendingLinks.add(id);
  } else {
    pendingLinks.delete(id);
  }
  notify();
}

export function subscribeNavPending(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNavPending(): boolean {
  return snapshot;
}

/** No servidor nunca ha navegacao em curso — evita mismatch de hidratacao. */
export function getServerNavPending(): boolean {
  return false;
}

/** Só para teste: zera ouvintes e links pendentes entre casos. */
export function resetNavProgressForTests(): void {
  listeners.clear();
  pendingLinks.clear();
  snapshot = false;
}
