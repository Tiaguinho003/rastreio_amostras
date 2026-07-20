// Pintura de um Informativo no canvas. Fino de proposito: percorre as ops que o
// layout ja posicionou. Nenhuma regra de negocio e nenhum conhecimento do TIPO
// da peca aqui — quem sabe o que desenhar e o *-layout.ts.

import {
  type AssetKey,
  type Layout,
  type MeasureText,
  type Op,
  type TextOp,
} from './story-layout.ts';

export const LOGO_SRC = '/logo-safras-branco.png';

/** Imagens ja carregadas, por chave. O layout referencia pela chave; chave
 * ausente (ou null) simplesmente nao pinta — e assim que o meteorologico sem
 * print sai com o painel branco vazio. */
export type AssetMap = Partial<Record<AssetKey, CanvasImageSource | null>>;

/** Monta a lista de ops. Recebe o measure porque so o canvas sabe medir a
 * Poppins — o mesmo motivo pelo qual o layout e puro. */
export type LayoutBuilder = (measure: MeasureText) => Layout;

/**
 * Familia da fonte para o ctx.font.
 *
 * GOTCHA: o next/font self-hospeda a Poppins com um nome de familia HASHEADO
 * (ex.: "__Poppins_a1b2c3"), entao `ctx.font = '700 86px Poppins'` cairia num
 * fallback silenciosamente. O nome real so existe na CSS var que o
 * app/layout.tsx injeta e o globals.css expoe como --font-family-story
 * (dedicada das pecas — a UI trocou para Inter na RD12, mas o visual do
 * informativo continua Poppins de proposito).
 */
export function resolveFontFamily(): string {
  if (typeof window === 'undefined') {
    return 'sans-serif';
  }
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-family-story')
    .trim();
  return resolved || 'sans-serif';
}

function fontSpec(weight: number, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

/** Mede texto com tracking: o canvas nao tem letter-spacing portatil, entao a
 * largura e a soma dos caracteres + o espaco entre eles. Precisa bater com o
 * drawText, senao a seta da variacao sai fora do lugar. */
export function makeMeasure(ctx: CanvasRenderingContext2D, family: string): MeasureText {
  return (text, weight, size, tracking) => {
    ctx.font = fontSpec(weight, size, family);
    if (tracking === 0) {
      return ctx.measureText(text).width;
    }
    let total = 0;
    for (const ch of text) {
      total += ctx.measureText(ch).width;
    }
    return total + tracking * (text.length - 1);
  };
}

function drawText(ctx: CanvasRenderingContext2D, op: TextOp, family: string, measure: MeasureText) {
  ctx.font = fontSpec(op.weight, op.size, family);
  ctx.fillStyle = op.fill;
  ctx.textBaseline = op.baseline === 'top' ? 'top' : 'middle';

  if (op.tracking === 0) {
    ctx.textAlign = op.align === 'center' ? 'center' : op.align === 'right' ? 'right' : 'left';
    ctx.fillText(op.text, op.x, op.y);
    return;
  }

  // Com tracking, desenha caractere a caractere — sempre a partir da esquerda,
  // com a origem corrigida pelo alinhamento.
  const total = measure(op.text, op.weight, op.size, op.tracking);
  let x = op.x;
  if (op.align === 'center') x -= total / 2;
  else if (op.align === 'right') x -= total;

  ctx.textAlign = 'left';
  for (const ch of op.text) {
    ctx.fillText(ch, x, op.y);
    x += ctx.measureText(ch).width + op.tracking;
  }
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawOp(
  ctx: CanvasRenderingContext2D,
  op: Op,
  family: string,
  measure: MeasureText,
  assets: AssetMap
) {
  switch (op.kind) {
    case 'rect': {
      if (op.radius) {
        roundedRectPath(ctx, op.x, op.y, op.w, op.h, op.radius);
        if (op.fill) {
          ctx.fillStyle = op.fill;
          ctx.fill();
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.strokeWidth ?? 1;
          ctx.stroke();
        }
      } else {
        if (op.fill) {
          ctx.fillStyle = op.fill;
          ctx.fillRect(op.x, op.y, op.w, op.h);
        }
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = op.strokeWidth ?? 1;
          ctx.strokeRect(op.x, op.y, op.w, op.h);
        }
      }
      return;
    }
    case 'text':
      drawText(ctx, op, family, measure);
      return;
    case 'triangle': {
      const h = op.size * 0.86;
      ctx.fillStyle = op.fill;
      ctx.beginPath();
      if (op.down) {
        ctx.moveTo(op.cx - op.size / 2, op.cy - h / 2);
        ctx.lineTo(op.cx + op.size / 2, op.cy - h / 2);
        ctx.lineTo(op.cx, op.cy + h / 2);
      } else {
        ctx.moveTo(op.cx - op.size / 2, op.cy + h / 2);
        ctx.lineTo(op.cx + op.size / 2, op.cy + h / 2);
        ctx.lineTo(op.cx, op.cy - h / 2);
      }
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'image': {
      const src = assets[op.asset];
      if (src) {
        ctx.drawImage(src, op.x, op.y, op.w, op.h);
      }
      return;
    }
    case 'path': {
      // O ctx.scale escala o lineWidth junto, entao op.strokeWidth fica em
      // unidades do viewBox — o mesmo comportamento do SVG.
      ctx.save();
      ctx.translate(op.x, op.y);
      ctx.scale(op.size / 24, op.size / 24);
      ctx.strokeStyle = op.stroke;
      ctx.lineWidth = op.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const d of op.d) {
        ctx.stroke(new Path2D(d));
      }
      ctx.restore();
      return;
    }
  }
}

let logoPromise: Promise<HTMLImageElement> | null = null;

/**
 * Carrega o lockup branco. O decode() e obrigatorio: sem ele o primeiro desenho
 * sai sem o logo (a imagem ainda nao decodificou).
 *
 * Memoiza SO o sucesso: guardar a promise rejeitada cacheria a falha para
 * sempre, e uma queda de rede num carregamento deixaria a peca sem logo ate o
 * reload.
 */
export async function loadLogo(): Promise<HTMLImageElement> {
  if (logoPromise) {
    return logoPromise;
  }
  const pending = (async () => {
    const img = new Image();
    img.src = LOGO_SRC;
    await img.decode();
    return img;
  })();
  logoPromise = pending;
  try {
    return await pending;
  } catch (err) {
    logoPromise = null;
    throw err;
  }
}

/**
 * Monta o layout e pinta no contexto. O canvas deve ser 1080x1920 — o alvo e o
 * arquivo final, nao a tela, entao devicePixelRatio nao entra na conta (a
 * exibicao e escalada por CSS).
 */
export function drawStory(
  ctx: CanvasRenderingContext2D,
  build: LayoutBuilder,
  assets: AssetMap
): Layout {
  const family = resolveFontFamily();
  const measure = makeMeasure(ctx, family);
  const layout = build(measure);

  ctx.clearRect(0, 0, layout.width, layout.height);
  for (const op of layout.ops) {
    drawOp(ctx, op, family, measure, assets);
  }
  return layout;
}
