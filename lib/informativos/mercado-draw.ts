// Pintura do Informativo de Mercado. O motor de desenho e generico e vive no
// story-draw.ts; aqui so amarramos o builder do mercado a ele.

import { buildMercadoLayout, type MercadoData } from './mercado-layout.ts';
import { drawStory, type AssetMap } from './story-draw.ts';
import { type Layout } from './story-layout.ts';

export function drawMercado(
  ctx: CanvasRenderingContext2D,
  data: MercadoData,
  assets: AssetMap
): Layout {
  return drawStory(ctx, (measure) => buildMercadoLayout(data, measure), assets);
}
