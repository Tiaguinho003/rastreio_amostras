import { redirect } from 'next/navigation';

// RC-D2 (2026-07-27): a pagina /embarques foi EXTINTA. As duas worklists que
// moravam nela (Embarque e Aprovacoes) viraram parte do proprio contrato — e um
// dia depois a RC-D65 apagou o EMBARQUE inteiro do produto. Do que sobrou, a
// aprovacao e hoje uma ABA do detalhe (RC-D126); o recorte "quais contratos
// precisam de etiqueta" vive na ordem por urgencia da lista e no card de Avisos.
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
