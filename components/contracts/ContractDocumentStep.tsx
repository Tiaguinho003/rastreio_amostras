'use client';

// RC-D27/D28: a CONFIRMAÇÃO PELO DOCUMENTO. "Emitir" deixou de emitir: ele monta
// o contrato, pede a prévia ao servidor e mostra o documento. Quem emite é o
// "Confirmar"; "Voltar" devolve o formulário intacto.
//
// O documento é o PDF DE VERDADE — mesma `_resolveEmitData` e mesmo
// `renderContractPdf` da emissão (RC-D28). Fidelidade por construção, não por
// réplica: revoga a RC-D14 (prévia "meio a meio" em HTML) e a RC-D15 (sem prévia
// no celular).
//
// RC-D53 (2026-07-28): isto DEIXOU DE SER UM MODAL. Era um diálogo central
// portalado, com backdrop cheio, que subia por cima do painel do formulário —
// duas superfícies para o que o usuário vive como um ato só. Virou o SEGUNDO
// PASSO do mesmo painel: sem portal, sem backdrop, sem header e sem rodapé
// próprios (o rodapé é o do painel, e é o pai que o monta). Com isso morre a
// exceção de "backdrop cheio sobre painel" registrada em `containers` §2.
//
// RC-D130 (2026-07-30): a rasterização e o desenho das páginas saíram daqui para o
// `ContractDocumentView`, que é agora o renderizador ÚNICO do domínio — o detalhe do
// contrato e os dois lugares do espelho usavam `<iframe>` e passaram a usar este mesmo
// desenho. O que sobrou neste arquivo é o que é DO PASSO: a linha de apoio, o aviso do
// número provisório e o download que libera o Confirmar.

import { ContractDocumentView, useContractDocumentPages } from './ContractDocumentView';
import type { ContractDocumentPage, ContractDocumentPages } from './ContractDocumentView';

import { downloadFile } from '../../lib/share-blob';

export { useContractDocumentPages };
export type { ContractDocumentPage, ContractDocumentPages };

type ContractDocumentStepProps = {
  /** PDF já gerado pelo endpoint de prévia. */
  blob: Blob;
  contractNumber: string | null;
  /** O número ainda vai ser alocado na emissão (criação) ou já é o do contrato. */
  provisionalNumber: boolean;
  document: ContractDocumentPages;
  /** Avisa o pai que o PDF foi baixado — é o que libera o Confirmar quando a tela falhou. */
  onDownloaded: () => void;
};

export function ContractDocumentStep({
  blob,
  contractNumber,
  provisionalNumber,
  document,
  onDownloaded,
}: ContractDocumentStepProps) {
  function handleDownload() {
    // Mesma convenção do nome que o servidor manda no Content-Disposition.
    const slug = (contractNumber ?? '').replace('/', '-').trim();
    downloadFile(blob, slug ? `contrato-${slug}-previa.pdf` : 'contrato-previa.pdf');
    onDownloaded();
  }

  return (
    <>
      <p className="fv-panel-lead">
        Confira o contrato · {contractNumber ? `Nº ${contractNumber}` : 'Documento'}
        {provisionalNumber ? ' · provisório' : ''} · ainda não emitido
      </p>

      <ContractDocumentView
        document={document}
        label="o contrato"
        // Rasterização falhou (aparelho antigo, memória, worker bloqueado). O PDF em si
        // está aqui e é válido — então a saída é BAIXAR e olhar, não emitir no escuro:
        // aqui o download é o que LIBERA o Confirmar (o guard da RC-D27).
        onFallbackDownload={handleDownload}
        fallbackLabel="Baixar o PDF para conferir"
      />

      {provisionalNumber ? (
        <p className="ctr-doc-hint">
          O número definitivo é gerado na emissão e pode diferir deste.
        </p>
      ) : null}
    </>
  );
}
