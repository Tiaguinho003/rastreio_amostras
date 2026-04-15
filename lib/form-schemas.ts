import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Usuario e obrigatorio'),
  password: z.string().min(1, 'Senha e obrigatoria'),
});

export const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().min(1, 'Email e obrigatorio').email('Email invalido'),
});

export const forgotPasswordVerifyCodeSchema = z.object({
  email: z.string().trim().min(1, 'Email e obrigatorio').email('Email invalido'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Codigo deve ter 6 digitos'),
});

export const forgotPasswordResetSchema = z.object({
  email: z.string().trim().min(1, 'Email e obrigatorio').email('Email invalido'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Codigo deve ter 6 digitos'),
  password: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres'),
});

export const registrationFormSchema = z.object({
  owner: z.string().min(1, 'Proprietario e obrigatorio'),
  sacks: z.coerce.number().int().min(1, 'Sacas deve ser >= 1'),
  harvest: z.string().min(1, 'Safra e obrigatoria'),
  originLot: z
    .string()
    .trim()
    .max(100, 'Lote de origem deve ter no maximo 100 caracteres')
    .optional()
    .nullable(),
  location: z
    .string()
    .trim()
    .max(30, 'Local deve ter no maximo 30 caracteres')
    .optional()
    .nullable(),
});

export const createSampleDraftSchema = z.object({
  owner: z.string().trim().min(1, 'Proprietario e obrigatorio'),
  sacks: z.coerce.number().int().min(1, 'Sacas deve ser >= 1'),
  harvest: z.string().trim().min(1, 'Safra e obrigatoria'),
  originLot: z
    .string()
    .trim()
    .max(100, 'Lote de origem deve ter no maximo 100 caracteres')
    .optional()
    .nullable(),
  location: z
    .string()
    .trim()
    .max(30, 'Local deve ter no maximo 30 caracteres')
    .optional()
    .nullable(),
  receivedChannel: z.enum(['in_person', 'courier', 'driver', 'other']).default('in_person'),
  notes: z.string().trim().max(500).optional().nullable(),
  printerId: z.string().trim().max(120).optional().nullable(),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, 'Nome completo e obrigatorio'),
  username: z.string().trim().min(1, 'Usuario e obrigatorio'),
  phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine(
      (value) => {
        if (!value) return true;
        const digits = value.replace(/\D/g, '');
        return digits.length === 10 || digits.length === 11;
      },
      { message: 'Telefone deve ter 10 ou 11 digitos' }
    ),
});

export const emailChangeRequestSchema = z.object({
  email: z.string().trim().min(1, 'Email e obrigatorio').email('Email invalido'),
});

export const emailChangeConfirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Codigo deve ter 6 digitos'),
});

export const changePasswordSchema = z.object({
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
});

export const invalidateSampleSchema = z.object({
  reasonCode: z.enum(['DUPLICATE', 'WRONG_SAMPLE', 'DAMAGED', 'CANCELLED', 'OTHER']),
  reasonText: z.string().trim().min(3, 'Informe o motivo com pelo menos 3 caracteres').max(300),
});

export const updateReasonSchema = z
  .object({
    reasonCode: z.enum(['DATA_FIX', 'TYPO', 'MISSING_INFO', 'OTHER']),
    reasonText: z
      .string()
      .trim()
      .refine(
        (value) => value.split(/\s+/).filter((part) => part.length > 0).length <= 10,
        'Justificativa deve ter no maximo 10 palavras'
      ),
  })
  .refine((data) => data.reasonCode !== 'OTHER' || data.reasonText.length >= 1, {
    message: 'Justificativa obrigatoria para "Outro motivo"',
    path: ['reasonText'],
  });
