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
