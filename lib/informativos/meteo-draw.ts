// Pintura do Informativo Meteorologico. O motor de desenho e generico e vive no
// story-draw.ts; aqui so amarramos o builder do meteorologico a ele.

import { buildMeteoLayout, type MeteoData } from './meteo-layout.ts';
import { drawStory, type AssetMap } from './story-draw.ts';
import { type Layout } from './story-layout.ts';

export function drawMeteo(
  ctx: CanvasRenderingContext2D,
  data: MeteoData,
  assets: AssetMap
): Layout {
  return drawStory(ctx, (measure) => buildMeteoLayout(data, measure), assets);
}
