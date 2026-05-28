// F3.11: telemetria estruturada de extracao da IA.
// Usa process.stderr.write (capturado por Cloud Run/Cloud Logging
// como log estruturado) pra evitar a regra no-console do ESLint.
// Em dev, aparece no stderr do `npm run dev`.

export function emitExtractionEvent(event) {
  try {
    const line = JSON.stringify({
      tag: 'classification.extraction',
      timestamp: new Date().toISOString(),
      ...event,
    });
    process.stderr.write(line + '\n');
  } catch {
    // serializacao falhou — silencioso (nao crashar producao por log)
  }
}

// Telemetria da etapa de deteccao/recorte da ficha (FormDetectionService).
// Mede detected, dimensoes do crop e da foto recebida (origWidth/Height
// = resolucao efetiva que chegou ao backend apos a compressao do browser),
// aspect e area. Base pra calibrar os limiares da deteccao com dados reais.
export function emitDetectionEvent(event) {
  try {
    const line = JSON.stringify({
      tag: 'classification.detection',
      timestamp: new Date().toISOString(),
      ...event,
    });
    process.stderr.write(line + '\n');
  } catch {
    // serializacao falhou — silencioso (nao crashar producao por log)
  }
}
