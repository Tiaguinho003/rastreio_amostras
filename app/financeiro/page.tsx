import { redirect } from 'next/navigation';

// A pagina Financeiro foi unificada como sub-aba do hub /contratos (Central de
// Contratos, F1/CC3). Mantido como redirect server-side pra bookmarks, links
// antigos e deep-links continuarem resolvendo (roda no RSC antes do AppShell
// montar — sem loop nem flicker), molde do /resumo -> /informe. Ver
// docs/Contratos-Visao-Geral.md (§2.1).
export default function FinanceiroRedirect() {
  redirect('/contratos?tab=financeiro');
}
