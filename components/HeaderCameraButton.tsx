'use client';

import { useCameraSheet } from '../lib/camera-sheet/CameraSheetProvider';

// Gatilho da camera no header mobile (RD16): saiu do cluster do
// HeaderAvatarMenu pra ocupar o canto ESQUERDO da faixa, do outro lado do menu
// da conta. Abre o bottom sheet global da camera (Flow A).
//
// ARMADILHA DE CAMADA: `useCameraSheet` so funciona DENTRO do
// <CameraSheetProvider>, que mora no AppShell — este botao e montado por ele,
// na propria faixa. Nao chamar de componente de rota.
interface HeaderCameraButtonProps {
  className?: string;
}

export function HeaderCameraButton({ className }: HeaderCameraButtonProps) {
  const cameraSheet = useCameraSheet();

  return (
    <button
      type="button"
      className={className ?? 'fv-mtopbar-btn'}
      aria-label="Abrir câmera"
      onClick={() => cameraSheet.open()}
    >
      {/* Camera de verdade (corpo + visor + lente). O icone anterior era o alvo
          do scanner — 4 cantos e uma linha —, que lia como "escanear". */}
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M3 8.8A1.8 1.8 0 0 1 4.8 7h2L8 4.9h8L17.2 7h2A1.8 1.8 0 0 1 21 8.8v8.4a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.2V8.8Z" />
        <circle cx="12" cy="13" r="3.4" />
      </svg>
    </button>
  );
}
