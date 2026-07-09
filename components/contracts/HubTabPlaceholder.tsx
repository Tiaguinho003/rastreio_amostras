'use client';

// Placeholder das sub-abas do hub ainda sem conteúdo (Financeiro em F1 até o C2;
// Aprovações e Embarque na F1) — Central de Contratos (CC12). Reusa o sheet + o
// estado vazio padrão pra o layout do hub (hero + sheet) ficar igual ao das abas
// com conteúdo. Sem lógica, endpoint ou campo novo.
export function HubTabPlaceholder() {
  return (
    <section className="clients-v2-sheet">
      <div className="spv2-list-scroll">
        <div className="spv2-empty">
          <p className="spv2-empty-text">Em breve</p>
          <p className="cc-placeholder-hint">Esta seção será ativada em breve.</p>
        </div>
      </div>
    </section>
  );
}
