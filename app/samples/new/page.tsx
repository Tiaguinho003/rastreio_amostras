'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../../../components/AppShell';
import { ClientLookupField } from '../../../components/clients/ClientLookupField';
import { ClientQuickCreateModal } from '../../../components/clients/ClientQuickCreateModal';
import { OwnerUnitField } from '../../../components/samples/OwnerUnitField';
import { ApiError, createSample, getClient } from '../../../lib/api-client';
import { useRegisterDirtyState } from '../../../lib/dirty-state/DirtyStateProvider';
import { createSampleDraftSchema } from '../../../lib/form-schemas';
import type { ClientUnitSummary, ClientSummary, CreateSampleResponse } from '../../../lib/types';
import { useFocusTrap } from '../../../lib/use-focus-trap';
import { useRequireAuth } from '../../../lib/use-auth';

const DRAFT_ID_STORAGE_KEY = 'new-sample-draft-id';

function buildDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadOrCreateDraftId(): string {
  try {
    const stored = sessionStorage.getItem(DRAFT_ID_STORAGE_KEY);
    if (stored) {
      return stored;
    }
  } catch {}

  const id = buildDraftId();
  persistDraftId(id);
  return id;
}

function renewDraftId(): string {
  const id = buildDraftId();
  persistDraftId(id);
  return id;
}

function persistDraftId(id: string) {
  try {
    sessionStorage.setItem(DRAFT_ID_STORAGE_KEY, id);
  } catch {}
}

function clearPersistedDraftId() {
  try {
    sessionStorage.removeItem(DRAFT_ID_STORAGE_KEY);
  } catch {}
}

function buildHarvestPresets(): readonly string[] {
  const year = new Date().getFullYear() % 100;
  return [
    `${year - 2}/${year - 1}`,
    `${year - 1}/${year}`,
    `${year}/${year + 1}`,
    `${year + 1}/${year + 2}`,
  ];
}

const HARVEST_PRESET_OPTIONS = buildHarvestPresets();
const REQUIRED_FIELD_MESSAGE = 'Obrigatório';

type RequiredFieldName = 'owner' | 'ownerUnit' | 'sacks' | 'harvest';
type RequiredFieldErrors = Record<RequiredFieldName, string | null>;
// Fase P3: step `completed` (com QR + polling de impressao) virou
// `created` (apenas mostra o lote em destaque pra anotar na saca,
// botao unico "Ir para amostra" redireciona pra detail page).
type LabelModalStep = 'review' | 'created';

interface PendingDraftPayload {
  clientDraftId: string;
  owner: string;
  ownerClientId: string | null;
  ownerUnitId: string | null;
  sacks: number;
  harvest: string;
  originLot: string | null;
  location: string | null;
  receivedChannel: 'in_person' | 'courier' | 'driver' | 'other';
  notes: string | null;
}

const EMPTY_REQUIRED_FIELD_ERRORS: RequiredFieldErrors = {
  owner: null,
  ownerUnit: null,
  sacks: null,
  harvest: null,
};

function hasRequiredFieldErrors(fieldErrors: RequiredFieldErrors) {
  return Object.values(fieldErrors).some((value) => Boolean(value));
}

function getMissingRequiredFieldErrors(
  values: Record<'owner' | 'sacks' | 'harvest', string>
): RequiredFieldErrors {
  return {
    owner: values.owner.trim() ? null : REQUIRED_FIELD_MESSAGE,
    ownerUnit: null,
    sacks: values.sacks.trim() ? null : REQUIRED_FIELD_MESSAGE,
    harvest: values.harvest.trim() ? null : REQUIRED_FIELD_MESSAGE,
  };
}

function getSchemaFieldErrors(
  issues: Array<{ path: PropertyKey[]; message: string }>
): RequiredFieldErrors {
  const next = { ...EMPTY_REQUIRED_FIELD_ERRORS };

  for (const issue of issues) {
    const path = issue.path[0];
    if (path !== 'owner' && path !== 'sacks' && path !== 'harvest') {
      continue;
    }

    next[path] = issue.message;
  }

  return next;
}

function buildModalTitle(step: LabelModalStep) {
  if (step === 'review') {
    return 'Confirme os dados da amostra';
  }

  return 'Amostra criada';
}

function NewSamplePageContent() {
  const { session, loading, logout, setSession } = useRequireAuth();
  const router = useRouter();

  const [clientDraftId, setClientDraftId] = useState(loadOrCreateDraftId);
  const [owner, setOwner] = useState('');
  const [selectedOwnerClient, setSelectedOwnerClient] = useState<ClientSummary | null>(null);
  const [ownerUnits, setOwnerUnits] = useState<ClientUnitSummary[]>([]);
  const [selectedOwnerUnitId, setSelectedOwnerUnitId] = useState<string | null>(null);
  const [ownerUnitLoading, setOwnerUnitLoading] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateSeed, setQuickCreateSeed] = useState('');
  const [sacks, setSacks] = useState('');
  const [harvest, setHarvest] = useState('');
  const [originLot, setOriginLot] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [harvestOptionsOpen, setHarvestOptionsOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [requiredFieldErrors, setRequiredFieldErrors] = useState<RequiredFieldErrors>(
    EMPTY_REQUIRED_FIELD_ERRORS
  );

  const [pendingDraft, setPendingDraft] = useState<PendingDraftPayload | null>(null);
  const [created, setCreated] = useState<CreateSampleResponse | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const labelTrapRef = useFocusTrap(labelModalOpen);
  const [labelModalStep, setLabelModalStep] = useState<LabelModalStep>('review');
  const [modalError, setModalError] = useState<string | null>(null);

  const ownerInputRef = useRef<HTMLInputElement | null>(null);
  const sacksInputRef = useRef<HTMLInputElement | null>(null);
  const harvestInputRef = useRef<HTMLInputElement | null>(null);
  const harvestFieldRef = useRef<HTMLDivElement | null>(null);
  const originLotInputRef = useRef<HTMLInputElement | null>(null);
  const stageBodyRef = useRef<HTMLDivElement | null>(null);
  const invalidFocusTimeoutRef = useRef<number | null>(null);
  const labelModalCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const modalPrimaryActionRef = useRef<HTMLButtonElement | null>(null);
  const lastCreateButtonRef = useRef<HTMLButtonElement | null>(null);
  const printableSample = useMemo(() => created?.sample ?? null, [created]);
  const canCloseModal = labelModalStep === 'review' || labelModalStep === 'created';

  const hasFormContent = Boolean(
    owner.trim() ||
    sacks.trim() ||
    harvest.trim() ||
    originLot.trim() ||
    location.trim() ||
    notes.trim()
  );
  const isFormDirty = hasFormContent || pendingDraft !== null;
  useRegisterDirtyState('samples/new', isFormDirty, 'Nova amostra em preenchimento');

  useEffect(() => {
    if (!session || !selectedOwnerClient) {
      setOwnerUnits([]);
      setSelectedOwnerUnitId(null);
      setOwnerUnitLoading(false);
      setOwner(selectedOwnerClient?.displayName ?? '');
      return;
    }

    let active = true;
    setOwnerUnitLoading(true);
    setError(null);
    setOwner(selectedOwnerClient.displayName ?? '');

    getClient(session, selectedOwnerClient.id)
      .then((response) => {
        if (!active) {
          return;
        }

        const activeUnits = response.units.filter((unit) => unit.status === 'ACTIVE');
        setOwnerUnits(activeUnits);
        setSelectedOwnerUnitId((current) =>
          activeUnits.some((unit) => unit.id === current) ? current : null
        );
      })
      .catch((cause) => {
        if (!active) {
          return;
        }

        setOwnerUnits([]);
        setSelectedOwnerUnitId(null);
        setError(
          cause instanceof ApiError ? cause.message : 'Falha ao carregar filiais do proprietario'
        );
      })
      .finally(() => {
        if (active) {
          setOwnerUnitLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedOwnerClient, session]);

  useEffect(() => {
    return () => {
      if (invalidFocusTimeoutRef.current !== null) {
        window.clearTimeout(invalidFocusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!harvestOptionsOpen) {
      return;
    }

    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!harvestFieldRef.current?.contains(target)) {
        setHarvestOptionsOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown);
    };
  }, [harvestOptionsOpen]);

  useEffect(() => {
    if (!labelModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (!canCloseModal) {
        return;
      }

      event.preventDefault();
      setLabelModalOpen(false);
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      if (canCloseModal) {
        labelModalCloseButtonRef.current?.focus();
        return;
      }

      modalPrimaryActionRef.current?.focus();
    }, 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.setTimeout(() => {
        lastCreateButtonRef.current?.focus();
      }, 0);
    };
  }, [canCloseModal, labelModalOpen]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (loading || !session) {
    return null;
  }

  function focusRequiredField(field: RequiredFieldName) {
    if (invalidFocusTimeoutRef.current !== null) {
      window.clearTimeout(invalidFocusTimeoutRef.current);
    }

    invalidFocusTimeoutRef.current = window.setTimeout(() => {
      const target =
        field === 'owner'
          ? ownerInputRef.current
          : field === 'sacks'
            ? sacksInputRef.current
            : field === 'harvest'
              ? harvestInputRef.current
              : null;

      target?.focus();
      target?.scrollIntoView({ block: 'nearest' });
      invalidFocusTimeoutRef.current = null;
    }, 60);
  }

  function focusFirstInvalidField(fieldErrors: RequiredFieldErrors) {
    const firstInvalidField = (['owner', 'ownerUnit', 'sacks', 'harvest'] as const).find((field) =>
      Boolean(fieldErrors[field])
    );
    if (!firstInvalidField) {
      return;
    }

    focusRequiredField(firstInvalidField);
  }

  function resetDraft() {
    setClientDraftId(renewDraftId());
    setOwner('');
    setSelectedOwnerClient(null);
    setOwnerUnits([]);
    setSelectedOwnerUnitId(null);
    setOwnerUnitLoading(false);
    setQuickCreateOpen(false);
    setQuickCreateSeed('');
    setSacks('');
    setHarvest('');
    setOriginLot('');
    setLocation('');
    setNotes('');
    setHarvestOptionsOpen(false);
    setPendingDraft(null);
    setLabelModalOpen(false);
    setLabelModalStep('review');
    setCreated(null);
    setError(null);
    setMessage(null);
    setModalError(null);
    setRequiredFieldErrors(EMPTY_REQUIRED_FIELD_ERRORS);
    setSubmitting(false);
  }

  function clearRequiredFieldError(field: RequiredFieldName) {
    setRequiredFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: null,
      };
    });
  }

  function closeLabelModal() {
    if (!canCloseModal) {
      return;
    }

    setLabelModalOpen(false);
  }

  // Fase P3: substitui handleConfirmCompleted/forceCloseLabelModal. Após
  // criar a amostra, o user clica "Ir para amostra" pra ir pra detail
  // page. Limpa o draft do sessionStorage (criado, não há mais nada
  // pra retomar).
  function goToCreatedSample() {
    if (!created) return;
    clearPersistedDraftId();
    setLabelModalOpen(false);
    router.push(`/samples/${created.sample.id}`);
  }

  function openReviewModal(trigger?: HTMLButtonElement) {
    if (!session) {
      return;
    }

    if (trigger) {
      lastCreateButtonRef.current = trigger;
    }

    setError(null);
    setMessage(null);
    setModalError(null);

    if (!selectedOwnerClient) {
      setRequiredFieldErrors((current) => ({
        ...current,
        owner: REQUIRED_FIELD_MESSAGE,
      }));
      focusRequiredField('owner');
      return;
    }

    // Fase R: defesa em profundidade. Pos-Fase 0/0.1, todo PF tem
    // sempre >=1 unit ativa (invariante mantida pelo backend), entao
    // este caso so aconteceria com dados pre-Fase 0 que nao pertencem
    // mais a producao. Mantemos o bloqueio como rede de seguranca.
    if (selectedOwnerClient.personType === 'PF' && ownerUnits.length === 0) {
      setError(
        'Este cliente PF nao tem fazenda ativa. Cadastre uma fazenda na pagina do cliente antes de registrar amostras.'
      );
      return;
    }

    const missingRequiredFieldErrors = getMissingRequiredFieldErrors({
      owner,
      sacks,
      harvest,
    });

    // Fase R: ownerUnitId obrigatorio quando o proprietario e PF.
    if (selectedOwnerClient.personType === 'PF' && !selectedOwnerUnitId) {
      missingRequiredFieldErrors.ownerUnit = REQUIRED_FIELD_MESSAGE;
    }

    if (hasRequiredFieldErrors(missingRequiredFieldErrors)) {
      setRequiredFieldErrors(missingRequiredFieldErrors);
      focusFirstInvalidField(missingRequiredFieldErrors);
      return;
    }

    const parsed = createSampleDraftSchema.safeParse({
      owner,
      sacks,
      harvest,
      originLot: originLot.trim() ? originLot : null,
      location: location.trim() ? location : null,
      notes: notes.trim() ? notes : null,
    });

    if (!parsed.success) {
      const schemaFieldErrors = getSchemaFieldErrors(parsed.error.issues);
      if (hasRequiredFieldErrors(schemaFieldErrors)) {
        setRequiredFieldErrors(schemaFieldErrors);
        focusFirstInvalidField(schemaFieldErrors);
      } else {
        setError(parsed.error.issues[0]?.message ?? 'Dados invalidos para criar amostra');
      }
      return;
    }

    setRequiredFieldErrors(EMPTY_REQUIRED_FIELD_ERRORS);

    setPendingDraft({
      clientDraftId,
      owner: parsed.data.owner,
      ownerClientId: selectedOwnerClient?.id ?? null,
      ownerUnitId: selectedOwnerUnitId ?? null,
      sacks: parsed.data.sacks,
      harvest: parsed.data.harvest,
      originLot: parsed.data.originLot ?? null,
      location: parsed.data.location ?? null,
      receivedChannel: parsed.data.receivedChannel,
      notes: parsed.data.notes ?? null,
    });

    setLabelModalStep('review');
    setLabelModalOpen(true);
  }

  async function handleConfirmDraft() {
    if (!session || !pendingDraft) {
      return;
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const result = await createSample(session, {
        clientDraftId: pendingDraft.clientDraftId,
        owner: pendingDraft.owner,
        ownerClientId: pendingDraft.ownerClientId,
        ownerUnitId: pendingDraft.ownerUnitId,
        sacks: pendingDraft.sacks,
        harvest: pendingDraft.harvest,
        originLot: pendingDraft.originLot,
        location: pendingDraft.location,
        receivedChannel: pendingDraft.receivedChannel,
        notes: pendingDraft.notes,
      });

      clearPersistedDraftId();

      setCreated(result);
      setLabelModalStep('created');
    } catch (cause) {
      if (cause instanceof ApiError) {
        setModalError(cause.message);
      } else {
        setModalError(cause instanceof Error ? cause.message : 'Falha ao criar amostra');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function previewValue(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') {
      return 'Nao informado';
    }

    return String(value);
  }

  const previewOwner = pendingDraft?.owner ?? printableSample?.declared.owner ?? null;
  const previewSacks = pendingDraft?.sacks ?? printableSample?.declared.sacks ?? null;
  const previewHarvest = pendingDraft?.harvest ?? printableSample?.declared.harvest ?? null;
  const previewOriginLot = pendingDraft?.originLot ?? printableSample?.declared.originLot ?? null;
  const previewLocation = pendingDraft?.location ?? printableSample?.declared.location ?? null;
  function hasUnsavedData() {
    return Boolean(
      owner.trim() ||
      sacks.trim() ||
      harvest.trim() ||
      originLot.trim() ||
      location.trim() ||
      notes.trim()
    );
  }

  const fullName = session.user.fullName ?? session.user.username;
  const avatarInitials = (() => {
    const parts = fullName.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : fullName.slice(0, 2).toUpperCase();
  })();
  return (
    <AppShell session={session} onLogout={logout} onSessionChange={setSession}>
      <section className="nsv2-page is-details-step">
        {/* ── Header ── */}
        <header className="nsv2-header">
          <Link href="/dashboard" className="nsv2-back" aria-label="Voltar ao dashboard">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>

          <div className="nsv2-header-center">
            <h2 className="nsv2-title">Nova Amostra</h2>
          </div>

          <button
            type="button"
            className="nsv2-avatar"
            aria-label="Abrir menu de perfil"
            onClick={() => window.dispatchEvent(new CustomEvent('open-profile-sheet'))}
          >
            <span className="nsv2-avatar-initials">{avatarInitials}</span>
          </button>
        </header>

        {/* ── Form ── */}
        <section className="nsv2-body nsv2-body-form">
          {error ? <p className="nsv2-inline-error">{error}</p> : null}
          {message ? <p className="nsv2-inline-success">{message}</p> : null}

          <div ref={stageBodyRef} className="nsv2-form-scroll">
            <div className="nsv2-form-grid">
              <div className="nsv2-grid-full">
                <ClientLookupField
                  session={session}
                  label="Proprietario"
                  kind="owner"
                  required
                  inputRef={ownerInputRef}
                  invalid={Boolean(requiredFieldErrors.owner)}
                  invalidText={requiredFieldErrors.owner ?? 'Obrigatorio'}
                  selectedClient={selectedOwnerClient}
                  onSelectClient={(client) => {
                    setSelectedOwnerClient(client);
                    setOwner(client?.displayName ?? '');
                    if (!client) {
                      setSelectedOwnerUnitId(null);
                    } else if (selectedOwnerClient?.id !== client.id) {
                      // Trocou de cliente: limpa unit selecionada (auto-select
                      // do OwnerUnitField cuida do PF + 1-fazenda).
                      setSelectedOwnerUnitId(null);
                    }
                    clearRequiredFieldError('owner');
                    clearRequiredFieldError('ownerUnit');
                    setError(null);
                  }}
                  onRequestCreate={(searchTerm) => {
                    setQuickCreateSeed(searchTerm);
                    setQuickCreateOpen(true);
                  }}
                  createLabel="+ Novo cliente"
                  createButtonStyle="inline-cta"
                />
              </div>

              <div className="nsv2-grid-full">
                <OwnerUnitField
                  session={session}
                  client={selectedOwnerClient}
                  units={ownerUnits}
                  loading={ownerUnitLoading}
                  selectedUnitId={selectedOwnerUnitId}
                  onSelect={(unitId) => {
                    setSelectedOwnerUnitId(unitId);
                    clearRequiredFieldError('ownerUnit');
                  }}
                  onUnitCreated={(unit) => {
                    setOwnerUnits((prev) => [...prev, unit]);
                  }}
                  required={selectedOwnerClient?.personType === 'PF'}
                  invalid={Boolean(requiredFieldErrors.ownerUnit)}
                  invalidText={requiredFieldErrors.ownerUnit ?? 'Obrigatório'}
                  onClearError={() => clearRequiredFieldError('ownerUnit')}
                />
              </div>

              <div className="nsv2-grid-half">
                <label className="nsv2-field">
                  <span className="nsv2-field-label">
                    Sacas<span className="nsv2-required-star"> *</span>
                  </span>
                  <input
                    ref={sacksInputRef}
                    value={sacks}
                    className={`nsv2-field-input ${requiredFieldErrors.sacks ? 'has-error' : ''}`}
                    aria-invalid={Boolean(requiredFieldErrors.sacks)}
                    onChange={(event) => {
                      setSacks(event.target.value.replace(/[^0-9]/g, ''));
                      clearRequiredFieldError('sacks');
                    }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder={requiredFieldErrors.sacks ? requiredFieldErrors.sacks : 'Ex: 40'}
                  />
                </label>
              </div>

              <div className="nsv2-grid-half" ref={harvestFieldRef}>
                <label className="nsv2-field" htmlFor="nsv2-harvest-input">
                  <span className="nsv2-field-label">
                    Safra<span className="nsv2-required-star"> *</span>
                  </span>
                  <input
                    id="nsv2-harvest-input"
                    ref={harvestInputRef}
                    className={`nsv2-field-input ${requiredFieldErrors.harvest ? 'has-error' : ''}`}
                    aria-invalid={Boolean(requiredFieldErrors.harvest)}
                    value={harvest}
                    onFocus={() => setHarvestOptionsOpen(true)}
                    onChange={(event) => {
                      setHarvest(event.target.value.toUpperCase());
                      clearRequiredFieldError('harvest');
                    }}
                    placeholder={
                      requiredFieldErrors.harvest
                        ? requiredFieldErrors.harvest
                        : `Ex: ${HARVEST_PRESET_OPTIONS[1] ?? '25/26'}`
                    }
                  />
                </label>
                {harvestOptionsOpen ? (
                  <div className="new-sample-harvest-options">
                    {HARVEST_PRESET_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`new-sample-harvest-option${harvest.trim() === option ? ' is-active' : ''}`}
                        onClick={() => {
                          setHarvest(option);
                          clearRequiredFieldError('harvest');
                          setHarvestOptionsOpen(false);
                        }}
                        disabled={submitting}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="nsv2-grid-half">
                <label className="nsv2-field">
                  <span className="nsv2-field-label">Lote de origem</span>
                  <input
                    ref={originLotInputRef}
                    value={originLot}
                    className="nsv2-field-input"
                    onChange={(event) => {
                      setOriginLot(event.target.value.toUpperCase());
                    }}
                    placeholder="Codigo do lote"
                  />
                </label>
              </div>

              <div className="nsv2-grid-half">
                <label className="nsv2-field">
                  <span className="nsv2-field-label">Local</span>
                  <input
                    value={location}
                    className="nsv2-field-input"
                    onChange={(event) => setLocation(event.target.value.toUpperCase())}
                    placeholder="Ex: BM, Patos"
                    maxLength={30}
                  />
                </label>
              </div>

              <div className="nsv2-grid-full">
                <label className="nsv2-field">
                  <span className="nsv2-field-label">Observacoes</span>
                  <input
                    value={notes}
                    className="nsv2-field-input"
                    onChange={(event) => setNotes(event.target.value.toUpperCase())}
                    placeholder=""
                  />
                </label>
              </div>
            </div>
          </div>
          <div className="nsv2-submit-wrap">
            <button
              type="button"
              className="nsv2-clear-btn"
              disabled={submitting || !hasUnsavedData()}
              onClick={resetDraft}
            >
              <span>Limpar</span>
            </button>
            <button
              ref={lastCreateButtonRef}
              type="button"
              className="nsv2-submit-btn"
              disabled={submitting || !isOnline}
              onClick={(event) => {
                if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                openReviewModal(event.currentTarget);
              }}
            >
              <span>{submitting ? 'Criando...' : 'Criar amostra'}</span>
            </button>
          </div>
        </section>

        {/* Offline banner */}
        {!isOnline ? (
          <div className="nsv2-offline-banner">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M1 1l22 22" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <span>Sem conexao</span>
          </div>
        ) : null}
      </section>

      {labelModalOpen ? (
        <div className="app-modal-backdrop new-sample-label-modal-backdrop">
          <section
            ref={labelTrapRef}
            className="app-modal is-themed new-sample-label-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-sample-label-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="app-modal-header">
              <div className="app-modal-title-wrap">
                <h3 id="new-sample-label-modal-title" className="app-modal-title">
                  {buildModalTitle(labelModalStep)}
                </h3>
              </div>

              {canCloseModal ? (
                <button
                  ref={labelModalCloseButtonRef}
                  type="button"
                  className="app-modal-close"
                  onClick={closeLabelModal}
                  aria-label="Fechar modal"
                >
                  <span aria-hidden="true">×</span>
                </button>
              ) : null}
            </header>

            <div className="new-sample-label-modal-content">
              {labelModalStep === 'review' ? (
                <article
                  id="sample-label-print"
                  className="label-print-card new-sample-label-print-card is-review-card"
                >
                  <div className="label-meta">
                    <p>
                      <strong>Proprietario:</strong> {previewValue(previewOwner)}
                    </p>
                    <p>
                      <strong>Sacas:</strong> {previewValue(previewSacks)}
                    </p>
                    <p>
                      <strong>Safra:</strong> {previewValue(previewHarvest)}
                    </p>
                    <p>
                      <strong>Lote origem:</strong> {previewValue(previewOriginLot)}
                    </p>
                    {previewLocation ? (
                      <p>
                        <strong>Local:</strong> {previewValue(previewLocation)}
                      </p>
                    ) : null}
                  </div>
                </article>
              ) : (
                /* Fase P3: step `created` foca no lote pra anotacao na saca.
                   Sem QR, sem dados de classificacao — esses voltam na
                   etiqueta fisica futura (Fase Pb). */
                <div
                  className="new-sample-created-panel"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span className="new-sample-created-panel__label">Lote</span>
                  <strong className="new-sample-created-panel__lot">
                    {created?.sample.internalLotNumber ?? '—'}
                  </strong>
                  <p className="new-sample-created-panel__hint">
                    Anote este número na saca antes de seguir.
                  </p>
                </div>
              )}
            </div>

            {modalError ? (
              <p className="error new-sample-label-modal-feedback">{modalError}</p>
            ) : null}

            <div className="new-sample-label-modal-actions">
              {labelModalStep === 'review' ? (
                <>
                  <button
                    type="button"
                    className="new-sample-modal-circle is-secondary"
                    disabled={submitting}
                    onClick={closeLabelModal}
                    aria-label="Editar"
                  >
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path d="M17 3l4 4L7 21H3v-4L17 3z" />
                    </svg>
                  </button>
                  <button
                    ref={modalPrimaryActionRef}
                    type="button"
                    className="new-sample-modal-circle is-primary"
                    disabled={submitting}
                    onClick={() => void handleConfirmDraft()}
                    aria-label={submitting ? 'Criando' : 'Confirmar'}
                  >
                    {submitting ? (
                      <span className="new-sample-modal-circle-spinner" />
                    ) : (
                      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                        <path d="m5 12.5 4.3 4.2L19 7" />
                      </svg>
                    )}
                  </button>
                </>
              ) : null}

              {labelModalStep === 'created' ? (
                <button
                  ref={modalPrimaryActionRef}
                  type="button"
                  className="nsv2-submit-btn new-sample-created-cta"
                  onClick={goToCreatedSample}
                >
                  Ir para amostra
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <ClientQuickCreateModal
        session={session}
        open={quickCreateOpen}
        title="Novo proprietario"
        initialSearch={quickCreateSeed}
        initialPersonType="PJ"
        initialIsSeller
        initialIsBuyer={false}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={(client) => {
          setQuickCreateOpen(false);
          setSelectedOwnerClient(client);
          setOwner(client.displayName ?? '');
          setSelectedOwnerUnitId(null);
          clearRequiredFieldError('owner');
          setMessage('Cliente criado e selecionado para a amostra.');
        }}
      />
    </AppShell>
  );
}

export default function NewSamplePage() {
  return (
    <Suspense fallback={null}>
      <NewSamplePageContent />
    </Suspense>
  );
}
