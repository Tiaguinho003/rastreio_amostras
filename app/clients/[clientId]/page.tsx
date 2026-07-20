import { redirect } from 'next/navigation';

// O detalhe do cliente e um OVERLAY sobre /cadastros desde a F1 do redesign
// (RD2: /cadastros?cliente=<id>; a pagina de detalhe morreu). Redirect
// server-side pra links salvos/externos continuarem abrindo no lugar novo.
export default async function ClientDetailRedirect({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  redirect(`/cadastros?cliente=${encodeURIComponent(clientId)}`);
}
