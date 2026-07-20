import { redirect } from 'next/navigation';

// O detalhe do lote e um OVERLAY sobre /samples desde a F2 do redesign
// (RD2: /samples?lote=<id>; a pagina de detalhe morreu). Redirect server-side
// PRESERVANDO a query: as entradas externas continuam entrando por aqui —
// QR fisico da etiqueta (?focus=classification&source=qr, backend-api.js),
// ScannerBridge (?source=scanner), busca global e links salvos (?focus=,
// ?highlight=print).
export default async function SampleDetailRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ sampleId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sampleId } = await params;
  const query = new URLSearchParams();
  query.set('lote', sampleId);
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key === 'lote' || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      query.append(key, item);
    }
  }
  redirect(`/samples?${query.toString()}`);
}
