import { redirect } from 'next/navigation';

// O antigo /resumo foi unificado na pagina "Relatorios" (rota /relatorios desde
// a unificacao 2026-07-15). Mantido como redirect server-side pra bookmarks,
// links antigos e deep-links de push continuarem resolvendo (roda no RSC antes
// do AppShell montar — sem loop nem flicker).
export default function ResumoRedirect() {
  redirect('/relatorios');
}
