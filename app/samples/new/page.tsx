'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

import { AppShell } from '../../../components/AppShell';
import { createSampleAndPreparePrint, ApiError } from '../../../lib/api-client';
import { createSampleDraftSchema } from '../../../lib/form-schemas';
import type { CreateSampleAndPreparePrintResponse } from '../../../lib/types';
import { useRequireAuth } from '../../../lib/use-auth';

function buildDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function NewSamplePage() {
  const { session, loading, logout } = useRequireAuth();

  const [clientDraftId, setClientDraftId] = useState(() => buildDraftId());
  const [owner, setOwner] = useState('');
  const [sacks, setSacks] = useState('');
  const [harvest, setHarvest] = useState('');
  const [originLot, setOriginLot] = useState('');
  const [notes, setNotes] = useState('');
  const [arrivalPhoto, setArrivalPhoto] = useState<File | null>(null);
  const [arrivalPhotoReady, setArrivalPhotoReady] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateSampleAndPreparePrintResponse | null>(null);

  const printableSample = useMemo(() => created?.sample ?? null, [created]);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('print-label-mode');
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('print-label-mode');
    };
  }, []);

  if (loading || !session) {
    return null;
  }

  function resetDraft() {
    setClientDraftId(buildDraftId());
    setOwner('');
    setSacks('');
    setHarvest('');
    setOriginLot('');
    setNotes('');
    setArrivalPhoto(null);
    setArrivalPhotoReady(false);
    setCreated(null);
    setError(null);
    setSubmitting(false);
  }

  function handlePrintLabel() {
    document.body.classList.add('print-label-mode');
    window.print();
  }

  async function handleCreateSample() {
    if (!session) {
      return;
    }

    setError(null);
    setSubmitting(true);

    const parsed = createSampleDraftSchema.safeParse({
      owner,
      sacks,
      harvest,
      originLot,
      notes: notes.trim() ? notes : null
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Dados invalidos para criar amostra');
      setSubmitting(false);
      return;
    }

    if (arrivalPhoto && !arrivalPhotoReady) {
      setError('Clique em "Usar foto" ou em "Tentar novamente" antes de criar a amostra.');
      setSubmitting(false);
      return;
    }

    try {
      const result = await createSampleAndPreparePrint(session, {
        clientDraftId,
        owner: parsed.data.owner,
        sacks: parsed.data.sacks,
        harvest: parsed.data.harvest,
        originLot: parsed.data.originLot,
        receivedChannel: parsed.data.receivedChannel,
        notes: parsed.data.notes ?? null,
        printerId: null,
        arrivalPhoto: arrivalPhotoReady ? arrivalPhoto : null
      });

      setCreated(result);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
      } else {
        setError('Falha inesperada ao criar amostra');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell session={session} onLogout={logout}>
      <section className="panel stack">
        <h2 style={{ margin: 0 }}>Nova amostra</h2>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Primeiro capture a foto da chegada (opcional) e, em seguida, preencha os dados para criar a amostra.
        </p>

        <article className="panel stack">
          <h3 style={{ margin: 0 }}>Foto da chegada (opcional)</h3>

          <label>
            Capturar/anexar foto
            <input
              accept="image/*"
              capture="environment"
              type="file"
              onChange={(event) => {
                setArrivalPhoto(event.target.files?.[0] ?? null);
                setArrivalPhotoReady(false);
              }}
            />
          </label>

          {arrivalPhoto ? <p style={{ margin: 0 }}>Arquivo selecionado: {arrivalPhoto.name}</p> : null}

          <div className="row">
            <button
              type="button"
              onClick={() => setArrivalPhotoReady(true)}
              disabled={!arrivalPhoto || arrivalPhotoReady || submitting}
            >
              Usar foto
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setArrivalPhoto(null);
                setArrivalPhotoReady(false);
              }}
              disabled={!arrivalPhoto || submitting}
            >
              Tentar novamente
            </button>
          </div>

          {arrivalPhotoReady ? <p className="success">Foto marcada para uso na criacao.</p> : null}
        </article>

        <div className="grid grid-2">
          <label>
            Proprietario
            <input value={owner} onChange={(event) => setOwner(event.target.value)} />
          </label>

          <label>
            Sacas
            <input value={sacks} onChange={(event) => setSacks(event.target.value)} inputMode="numeric" />
          </label>

          <label>
            Safra
            <input value={harvest} onChange={(event) => setHarvest(event.target.value)} placeholder="24/25" />
          </label>

          <label>
            Lote de origem
            <input value={originLot} onChange={(event) => setOriginLot(event.target.value)} />
          </label>
        </div>

        <label>
          Observacoes (opcional)
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>

        <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.82rem' }}>
          Rascunho: esta amostra sera referenciada pelo lote {originLot.trim() || 'a definir'}
        </p>

        {error ? <p className="error">{error}</p> : null}

        <div className="row">
          <button
            type="button"
            disabled={submitting || (Boolean(arrivalPhoto) && !arrivalPhotoReady)}
            onClick={() => void handleCreateSample()}
          >
            {submitting ? 'Criando amostra...' : 'Criar amostra'}
          </button>
          <button type="button" className="secondary" disabled={submitting} onClick={resetDraft}>
            Limpar formulario
          </button>
        </div>
      </section>

      {printableSample ? (
        <section className="panel stack">
          <h3 style={{ margin: 0 }}>Etiqueta pronta para impressao</h3>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            A amostra foi criada e esta com QR solicitado para impressao.
          </p>

          <article id="sample-label-print" className="label-print-card">
            <div className="label-qr">
              <QRCodeCanvas value={created?.qr.value ?? printableSample.id} size={120} />
            </div>
            <div className="label-meta">
              <p>
                <strong>Lote interno:</strong> {printableSample.internalLotNumber ?? 'Nao definido'}
              </p>
              <p>
                <strong>Amostra ID:</strong> {printableSample.id}
              </p>
              <p>
                <strong>Proprietario:</strong> {printableSample.declared.owner ?? 'Nao informado'}
              </p>
              <p>
                <strong>Sacas:</strong> {printableSample.declared.sacks ?? 'Nao informado'}
              </p>
              <p>
                <strong>Safra:</strong> {printableSample.declared.harvest ?? 'Nao informado'}
              </p>
              <p>
                <strong>Lote origem:</strong> {printableSample.declared.originLot ?? 'Nao informado'}
              </p>
            </div>
          </article>

          <div className="row">
            <button type="button" onClick={handlePrintLabel}>
              Imprimir etiqueta
            </button>
            <Link href={`/samples/${printableSample.id}`}>
              <button type="button" className="secondary">
                Ver detalhes da amostra
              </button>
            </Link>
            <button type="button" className="secondary" onClick={resetDraft}>
              Nova amostra
            </button>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
