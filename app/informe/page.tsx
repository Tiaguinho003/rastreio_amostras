import { redirect } from 'next/navigation';

// A pagina "Relatorios" migrou de /informe para /relatorios (unificacao
// 2026-07-15). Mantido como redirect server-side pra bookmarks, links antigos e
// o precache do service worker continuarem resolvendo (roda no RSC antes do
// AppShell montar — sem loop nem flicker).
export default function InformeRedirect() {
  redirect('/relatorios');
}
