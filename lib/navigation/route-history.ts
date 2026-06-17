// Rastreia a rota que o usuario ACABOU de deixar, pra uma pagina saber "de onde
// vim" durante o proprio render (antes de qualquer efeito rodar).
//
// `markActivePath` so e chamado dentro de um useEffect (pos-commit), pelo
// RouteHistoryTracker montado no layout (arvore persistente). Quando uma rota
// NOVA renderiza, `activePath` ainda guarda a rota anterior — o efeito que vai
// atualiza-lo so roda DEPOIS do render. Logo, ler `getRouteLeftBehind()` no
// render da pagina nova devolve exatamente a rota de origem.
//
// Cobre navegacao via <Link>, router.push e voltar do navegador (popstate muda
// o pathname). Reseta em reload completo (onde nao ha origem mesmo) — modulo
// recarregado => activePath volta a null.

let activePath: string | null = null;

export function markActivePath(path: string): void {
  activePath = path;
}

export function getRouteLeftBehind(): string | null {
  return activePath;
}
