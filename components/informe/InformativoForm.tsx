'use client';

// Formulario do Informativo de Mercado (opcao "Informativo" do FAB da
// /relatorios). Duas etapas: preencher os 21 controles -> ver a peca e baixar.
//
// Nada e salvo (P1): sem rota de API, sem banco. O canvas desenha 1080x1920 no
// cliente e o shareOrDownloadFile entrega — compartilhar no celular (share
// sheet -> Instagram) ou baixar no PC.
//
// Reusa a linguagem do CommercialVisitForm (.inf-card/.inf-field/.inf-pill) e
// acrescenta so o que e proprio da peca, no prefixo .ifm-.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatDateExtensoLocal, formatDateIsoLocal } from '../../lib/date-br';
import {
  MAX_LEN,
  maskAnoInput,
  maskBolsa,
  maskDolar,
  maskPreco,
  maskSafraInput,
  maskUpperInput,
  maskVariacao,
  type VariacaoDir,
} from '../../lib/informativos/format';
import { drawMercado } from '../../lib/informativos/mercado-draw';
import { loadLogo } from '../../lib/informativos/story-draw';
import { type MercadoData } from '../../lib/informativos/mercado-layout';
import { H, W } from '../../lib/informativos/story-layout';
import { EMPTY_SLOW_FIELDS, type SlowFields } from '../../lib/informativos/slow-fields-store';
import { shareOrDownloadFile } from '../../lib/share-blob';

interface InformativoFormProps {
  onDirtyChange?: (dirty: boolean) => void;
  /** Peca entregue (baixada ou compartilhada) — o sheet fecha. */
  onGenerated?: () => void;
  /** Carrega os campos "lentos" da ultima geracao (INF25). */
  initialSlow?: SlowFields | null;
  /** Persiste os campos "lentos" ao gerar. */
  onPersistSlow?: (slow: SlowFields) => void;
}

export function InformativoForm({
  onDirtyChange,
  onGenerated,
  initialSlow,
  onPersistSlow,
}: InformativoFormProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Campos "lentos" (INF36): pre-preenchidos da ultima geracao.
  const [slow, setSlow] = useState<SlowFields>(initialSlow ?? EMPTY_SLOW_FIELDS);

  // Campos do dia: SEMPRE em branco (INF36) — e o que impede publicar o valor
  // de ontem por distracao.
  const [bolsa, setBolsa] = useState('');
  const [variacaoDir, setVariacaoDir] = useState<VariacaoDir | null>(null);
  const [variacao, setVariacao] = useState('');
  const [dolar, setDolar] = useState('');
  const [fisicoPreco, setFisicoPreco] = useState('');
  const [precoA1, setPrecoA1] = useState('');
  const [precoB1, setPrecoB1] = useState('');
  const [precoA2, setPrecoA2] = useState('');
  const [precoB2, setPrecoB2] = useState('');
  const [cprA, setCprA] = useState('');
  const [cprB, setCprB] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const logoRef = useRef<CanvasImageSource | null>(null);

  // A data e travada em hoje (INF17) e vem do relogio LOCAL — o canvas roda no
  // navegador, entao e o dia de quem esta publicando.
  const hoje = useMemo(() => new Date(), []);
  const dataTexto = useMemo(() => formatDateExtensoLocal(hoje), [hoje]);

  function patchSlow(patch: Partial<SlowFields>) {
    setSlow((prev) => ({ ...prev, ...patch }));
    setError(null);
  }

  const data: MercadoData = useMemo(
    () => ({
      dataTexto,
      bolsaLabel: slow.bolsaLabel,
      bolsa,
      variacaoDir: variacaoDir ?? 'baixa',
      variacao,
      dolar,
      safra: slow.safra,
      fisicoPreco,
      futuroAnoA: slow.futuroAnoA,
      futuroAnoB: slow.futuroAnoB,
      futuro: [
        { mesA: slow.mesA1, precoA: precoA1, mesB: slow.mesB1, precoB: precoB1 },
        { mesA: slow.mesA2, precoA: precoA2, mesB: slow.mesB2, precoB: precoB2 },
      ],
      cprAnoA: slow.cprAnoA,
      cprAnoB: slow.cprAnoB,
      cprA,
      cprB,
    }),
    [
      dataTexto,
      slow,
      bolsa,
      variacaoDir,
      variacao,
      dolar,
      fisicoPreco,
      precoA1,
      precoB1,
      precoA2,
      precoB2,
      cprA,
      cprB,
    ]
  );

  // Todos os campos sao obrigatorios (INF28).
  const missing = useMemo(() => {
    const required: Array<[string, string]> = [
      ['bolsaLabel', slow.bolsaLabel],
      ['bolsa', bolsa],
      ['variacaoDir', variacaoDir ?? ''],
      ['variacao', variacao],
      ['dolar', dolar],
      ['safra', slow.safra],
      ['fisicoPreco', fisicoPreco],
      ['futuroAnoA', slow.futuroAnoA],
      ['futuroAnoB', slow.futuroAnoB],
      ['mesA1', slow.mesA1],
      ['precoA1', precoA1],
      ['mesB1', slow.mesB1],
      ['precoB1', precoB1],
      ['mesA2', slow.mesA2],
      ['precoA2', precoA2],
      ['mesB2', slow.mesB2],
      ['precoB2', precoB2],
      ['cprAnoA', slow.cprAnoA],
      ['cprAnoB', slow.cprAnoB],
      ['cprA', cprA],
      ['cprB', cprB],
    ];
    return new Set(required.filter(([, v]) => v.trim() === '').map(([k]) => k));
  }, [
    slow,
    bolsa,
    variacaoDir,
    variacao,
    dolar,
    fisicoPreco,
    precoA1,
    precoB1,
    precoA2,
    precoB2,
    cprA,
    cprB,
  ]);

  const dirty = useMemo(
    () =>
      [bolsa, variacao, dolar, fisicoPreco, precoA1, precoB1, precoA2, precoB2, cprA, cprB].some(
        (v) => v.trim() !== ''
      ) || variacaoDir !== null,
    [
      bolsa,
      variacaoDir,
      variacao,
      dolar,
      fisicoPreco,
      precoA1,
      precoB1,
      precoA2,
      precoB2,
      cprA,
      cprB,
    ]
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Desenha a peca sempre que a etapa 2 abre ou os dados mudam.
  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;

    async function paint() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // A Poppins vem do next/font: sem esperar, o primeiro desenho sai num
      // fallback e a peca muda de cara ao redesenhar.
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      if (!logoRef.current) {
        try {
          logoRef.current = await loadLogo();
        } catch {
          logoRef.current = null;
        }
      }
      if (cancelled) return;
      drawMercado(ctx, data, { logo: logoRef.current });
    }

    void paint();
    return () => {
      cancelled = true;
    };
  }, [step, data]);

  const handleAdvance = useCallback(() => {
    setSubmitted(true);
    if (missing.size > 0) {
      setError('Preencha todos os campos para gerar o informativo.');
      return;
    }
    setError(null);
    setStep(2);
  }, [missing]);

  const handleDownload = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) {
        setError('Não foi possível gerar a imagem. Tente novamente.');
        return;
      }
      const filename = `informativo-mercado-${formatDateIsoLocal(hoje)}.png`;
      const result = await shareOrDownloadFile(blob, filename, {
        mimeType: 'image/png',
        shareTitle: 'Informativo de mercado',
      });
      // Cancelou o compartilhamento: nada se perde, o modal fica aberto.
      if (result === 'cancelled') {
        return;
      }
      onPersistSlow?.(slow);
      onGenerated?.();
    } catch {
      setError('Não foi possível gerar a imagem. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }, [busy, hoje, onGenerated, onPersistSlow, slow]);

  const invalid = (key: string) => submitted && missing.has(key);
  const cls = (key: string) => `inf-input${invalid(key) ? ' has-error' : ''}`;

  if (step === 2) {
    return (
      <div className="inf-form ifm-preview-step">
        <p className="ifm-preview-hint">Confira antes de publicar.</p>
        <div className="ifm-preview-frame">
          <canvas ref={canvasRef} width={W} height={H} className="ifm-preview-canvas" />
        </div>
        {error ? <p className="inf-card-error">{error}</p> : null}
        <div className="ifm-preview-actions">
          <button
            type="button"
            className="app-modal-secondary"
            onClick={() => setStep(1)}
            disabled={busy}
          >
            Voltar e ajustar
          </button>
          <button
            type="button"
            className="inf-submit"
            onClick={() => void handleDownload()}
            disabled={busy}
          >
            {busy ? 'Gerando…' : 'Baixar informativo'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="inf-form">
      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            1
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">Resumo do mercado</h3>
            <p className="inf-card-sub">A data de hoje entra sozinha na peça</p>
          </div>
        </header>

        <label className="inf-field">
          <span className="inf-field-label">Bolsa NY</span>
          <input
            className={cls('bolsaLabel')}
            value={slow.bolsaLabel}
            inputMode="text"
            placeholder="Bolsa NY - mai/26"
            onChange={(e) =>
              patchSlow({ bolsaLabel: maskUpperInput(e.target.value, MAX_LEN.bolsaLabel) })
            }
          />
        </label>

        <div className="ifm-pair">
          <label className="inf-field">
            <span className="inf-field-label">Valor da bolsa</span>
            <input
              className={cls('bolsa')}
              value={bolsa}
              inputMode="numeric"
              placeholder="292,65"
              onChange={(e) => {
                setBolsa(maskBolsa(e.target.value));
                setError(null);
              }}
            />
            <span className="ifm-unit">Usc/lp</span>
          </label>

          <label className="inf-field">
            <span className="inf-field-label">Dólar</span>
            <input
              className={cls('dolar')}
              value={dolar}
              inputMode="numeric"
              placeholder="5,2303"
              onChange={(e) => {
                setDolar(maskDolar(e.target.value));
                setError(null);
              }}
            />
            <span className="ifm-unit">R$/US$</span>
          </label>
        </div>

        <div className="inf-field">
          <span className="inf-field-label">Variação</span>
          <div
            className="inf-choice-grid ifm-dir-grid"
            role="group"
            aria-label="Direção da variação"
          >
            <button
              type="button"
              className={`inf-pill ifm-dir${variacaoDir === 'alta' ? ' is-selected is-alta' : ''}`}
              aria-pressed={variacaoDir === 'alta'}
              onClick={() => {
                setVariacaoDir('alta');
                setError(null);
              }}
            >
              <span className="ifm-dir-arrow is-up" aria-hidden="true" />
              Alta
            </button>
            <button
              type="button"
              className={`inf-pill ifm-dir${variacaoDir === 'baixa' ? ' is-selected is-baixa' : ''}`}
              aria-pressed={variacaoDir === 'baixa'}
              onClick={() => {
                setVariacaoDir('baixa');
                setError(null);
              }}
            >
              <span className="ifm-dir-arrow is-down" aria-hidden="true" />
              Baixa
            </button>
          </div>
        </div>

        <label className="inf-field">
          <span className="inf-field-label">Pontos</span>
          <input
            className={cls('variacao')}
            value={variacao}
            inputMode="numeric"
            placeholder="20"
            onChange={(e) => {
              setVariacao(maskVariacao(e.target.value));
              setError(null);
            }}
          />
          <span className="ifm-unit">pts</span>
        </label>
      </section>

      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            2
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">Mercado físico</h3>
            <p className="inf-card-sub">Café tipo 6/7, preço livre</p>
          </div>
        </header>

        <div className="ifm-pair">
          <label className="inf-field">
            <span className="inf-field-label">Safra</span>
            <input
              className={cls('safra')}
              value={slow.safra}
              inputMode="numeric"
              placeholder="25/26"
              onChange={(e) => patchSlow({ safra: maskSafraInput(e.target.value) })}
            />
          </label>

          <label className="inf-field">
            <span className="inf-field-label">Preço</span>
            <input
              className={cls('fisicoPreco')}
              value={fisicoPreco}
              inputMode="numeric"
              placeholder="1.960,00"
              onChange={(e) => {
                setFisicoPreco(maskPreco(e.target.value));
                setError(null);
              }}
            />
            <span className="ifm-unit">R$</span>
          </label>
        </div>
      </section>

      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            3
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">Mercado futuro</h3>
            <p className="inf-card-sub">Preço livre, duas safras</p>
          </div>
        </header>

        <div className="ifm-pair">
          <label className="inf-field">
            <span className="inf-field-label">Ano da coluna 1</span>
            <input
              className={cls('futuroAnoA')}
              value={slow.futuroAnoA}
              inputMode="numeric"
              placeholder="2026"
              onChange={(e) => patchSlow({ futuroAnoA: maskAnoInput(e.target.value) })}
            />
          </label>
          <label className="inf-field">
            <span className="inf-field-label">Ano da coluna 2</span>
            <input
              className={cls('futuroAnoB')}
              value={slow.futuroAnoB}
              inputMode="numeric"
              placeholder="2027"
              onChange={(e) => patchSlow({ futuroAnoB: maskAnoInput(e.target.value) })}
            />
          </label>
        </div>

        {([1, 2] as const).map((n) => {
          const mesAKey = `mesA${n}` as const;
          const mesBKey = `mesB${n}` as const;
          const precoAKey = `precoA${n}`;
          const precoBKey = `precoB${n}`;
          const precoAValue = n === 1 ? precoA1 : precoA2;
          const precoBValue = n === 1 ? precoB1 : precoB2;
          const setPrecoA = n === 1 ? setPrecoA1 : setPrecoA2;
          const setPrecoB = n === 1 ? setPrecoB1 : setPrecoB2;
          return (
            <div className="ifm-row-group" key={n}>
              <span className="ifm-row-legend">Linha {n}</span>
              <div className="ifm-quad">
                <label className="inf-field">
                  <span className="inf-field-label">Mês {slow.futuroAnoA || '(coluna 1)'}</span>
                  <input
                    className={cls(mesAKey)}
                    value={slow[mesAKey]}
                    placeholder="AGO"
                    onChange={(e) =>
                      patchSlow({ [mesAKey]: maskUpperInput(e.target.value, MAX_LEN.mes) })
                    }
                  />
                </label>
                <label className="inf-field">
                  <span className="inf-field-label">Preço</span>
                  <input
                    className={cls(precoAKey)}
                    value={precoAValue}
                    inputMode="numeric"
                    placeholder="1.690,00"
                    onChange={(e) => {
                      setPrecoA(maskPreco(e.target.value));
                      setError(null);
                    }}
                  />
                </label>
                <label className="inf-field">
                  <span className="inf-field-label">Mês {slow.futuroAnoB || '(coluna 2)'}</span>
                  <input
                    className={cls(mesBKey)}
                    value={slow[mesBKey]}
                    placeholder="AGO"
                    onChange={(e) =>
                      patchSlow({ [mesBKey]: maskUpperInput(e.target.value, MAX_LEN.mes) })
                    }
                  />
                </label>
                <label className="inf-field">
                  <span className="inf-field-label">Preço</span>
                  <input
                    className={cls(precoBKey)}
                    value={precoBValue}
                    inputMode="numeric"
                    placeholder="1.620,00"
                    onChange={(e) => {
                      setPrecoB(maskPreco(e.target.value));
                      setError(null);
                    }}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </section>

      <section className="inf-card">
        <header className="inf-card-head">
          <span className="inf-card-num" aria-hidden="true">
            4
          </span>
          <div className="inf-card-head-text">
            <h3 className="inf-card-title">CPR — mercado futuro</h3>
            <p className="inf-card-sub">Um valor por ano</p>
          </div>
        </header>

        <div className="ifm-quad">
          <label className="inf-field">
            <span className="inf-field-label">Ano da coluna 1</span>
            <input
              className={cls('cprAnoA')}
              value={slow.cprAnoA}
              inputMode="numeric"
              placeholder="2026"
              onChange={(e) => patchSlow({ cprAnoA: maskAnoInput(e.target.value) })}
            />
          </label>
          <label className="inf-field">
            <span className="inf-field-label">Valor</span>
            <input
              className={cls('cprA')}
              value={cprA}
              inputMode="numeric"
              placeholder="1.545,00"
              onChange={(e) => {
                setCprA(maskPreco(e.target.value));
                setError(null);
              }}
            />
          </label>
          <label className="inf-field">
            <span className="inf-field-label">Ano da coluna 2</span>
            <input
              className={cls('cprAnoB')}
              value={slow.cprAnoB}
              inputMode="numeric"
              placeholder="2027"
              onChange={(e) => patchSlow({ cprAnoB: maskAnoInput(e.target.value) })}
            />
          </label>
          <label className="inf-field">
            <span className="inf-field-label">Valor</span>
            <input
              className={cls('cprB')}
              value={cprB}
              inputMode="numeric"
              placeholder="1.245,00"
              onChange={(e) => {
                setCprB(maskPreco(e.target.value));
                setError(null);
              }}
            />
          </label>
        </div>
      </section>

      {error ? <p className="inf-card-error">{error}</p> : null}

      <button type="button" className="inf-submit" onClick={handleAdvance}>
        Ver informativo
      </button>
    </div>
  );
}
