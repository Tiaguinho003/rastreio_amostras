import { redirect } from 'next/navigation';

// O antigo /resumo foi unificado na pagina "Relatorios" (rota /informe), que
// adapta o conteudo ao papel: ADMIN/CADASTRO veem TODOS os formularios +
// curadoria de vinculo; COMMERCIAL ve os proprios. Mantido como redirect
// server-side pra bookmarks, links antigos e deep-links de push continuarem
// resolvendo (roda no RSC antes do AppShell montar — sem loop nem flicker).
export default function ResumoRedirect() {
  redirect('/informe');
}
