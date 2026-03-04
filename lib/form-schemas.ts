import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Usuario e obrigatorio'),
  password: z.string().min(1, 'Senha e obrigatoria')
});

export const receiveSampleSchema = z.object({
  receivedChannel: z.enum(['in_person', 'courier', 'driver', 'other']),
  notes: z.string().max(500).optional().nullable()
});

export const registrationFormSchema = z.object({
  owner: z.string().min(1, 'Proprietario e obrigatorio'),
  sacks: z.coerce.number().int().min(1, 'Sacas deve ser >= 1'),
  harvest: z.string().min(1, 'Safra e obrigatoria'),
  originLot: z.string().min(1, 'Lote de origem e obrigatorio')
});

export const createSampleDraftSchema = z.object({
  owner: z.string().trim().min(1, 'Proprietario e obrigatorio'),
  sacks: z.coerce.number().int().min(1, 'Sacas deve ser >= 1'),
  harvest: z.string().trim().min(1, 'Safra e obrigatoria'),
  originLot: z.string().trim().min(1, 'Lote de origem e obrigatorio'),
  receivedChannel: z.enum(['in_person', 'courier', 'driver', 'other']).default('in_person'),
  notes: z.string().trim().max(500).optional().nullable(),
  printerId: z.string().trim().max(120).optional().nullable()
});

export const qrFailSchema = z.object({
  error: z.string().min(1, 'Descreva a falha de impressao')
});

export const invalidateSampleSchema = z.object({
  reasonCode: z.enum(['DUPLICATE', 'WRONG_SAMPLE', 'DAMAGED', 'CANCELLED', 'OTHER']),
  reasonText: z.string().trim().min(3, 'Informe o motivo com pelo menos 3 caracteres').max(300)
});

export const updateReasonSchema = z.object({
  reasonCode: z.enum(['DATA_FIX', 'TYPO', 'MISSING_INFO', 'OTHER']),
  reasonText: z
    .string()
    .trim()
    .min(1, 'Justificativa obrigatoria')
    .refine(
      (value) => value.split(/\s+/).filter((part) => part.length > 0).length <= 10,
      'Justificativa deve ter no maximo 10 palavras'
    )
});
