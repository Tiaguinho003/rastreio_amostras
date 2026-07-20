import { redirect } from 'next/navigation';

// A lista de clientes vive na aba Clientes de /cadastros desde a unificacao
// de acesso por papel (o item "Clientes" saiu da nav de todos), e a F1 do
// redesign aposentou esta rota. Redirect server-side (roda no RSC antes do
// AppShell montar — sem flicker; molde do /financeiro), preservando o
// deep-link ?incomplete=true.
export default async function ClientsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  redirect(params.incomplete === 'true' ? '/cadastros?incomplete=true' : '/cadastros');
}
