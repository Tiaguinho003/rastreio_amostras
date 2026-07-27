import { redirect } from 'next/navigation';

// RC-D2 (2026-07-27): a pagina /embarques foi EXTINTA. As duas worklists que
// moravam nela (Embarque e Aprovacoes) viram FASE dentro do proprio contrato: as
// acoes ja estao nas secoes Aprovacao e Embarque do detalhe (RC-D25), e a lista
// de contratos absorve o recorte por fase na RC-F3.
//
// O split de 2026-07-13 que criou esta rota separava GESTAO de OPERACAO — eixo
// que o acesso unificado de 2026-07-15 apagou dois dias depois, igualando os
// gates. Sobrou forma sem funcao.
//
// Mantido como redirect server-side pra bookmarks e deep-links continuarem
// resolvendo (roda no RSC antes do AppShell montar — sem loop nem flicker),
// molde do que a propria /financeiro era ate ontem. O `?tab=` e o `?highlight=`
// dos links antigos caem junto: quem apontava pra ca agora aponta pro contrato
// (`/contratos?details=<id>`).
export default function EmbarquesRedirect() {
  redirect('/contratos');
}
