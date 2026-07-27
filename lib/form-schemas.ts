import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Usuário é obrigatório'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

export const forgotPasswordRequestSchema = z.object({
  email: z.string().trim().min(1, 'E-mail é obrigatório').email('E-mail inválido'),
});

export const forgotPasswordVerifyCodeSchema = z.object({
  email: z.string().trim().min(1, 'E-mail é obrigatório').email('E-mail inválido'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
});

export const forgotPasswordResetSchema = z.object({
  email: z.string().trim().min(1, 'E-mail é obrigatório').email('E-mail inválido'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
  password: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres'),
});

export const registrationFormSchema = z.object({
  owner: z.string().min(1, 'Proprietário é obrigatório'),
  sacks: z.coerce.number().int().min(1, 'Sacas deve ser >= 1'),
  harvest: z.string().min(1, 'Safra é obrigatória'),
  originLot: z.string().trim().max(2000, 'Lote de origem muito longo').optional().nullable(),
  location: z
    .string()
    .trim()
    .max(30, 'Local deve ter no máximo 30 caracteres')
    .optional()
    .nullable(),
});

export const createSampleDraftSchema = z.object({
  owner: z.string().trim().min(1, 'Proprietário é obrigatório'),
  // O lote se vincula apenas ao proprietario (ownerClient); nao ha mais
  // selecao de fazenda/unit.
  ownerClientId: z.string().uuid().optional().nullable(),
  sacks: z.coerce.number().int().min(1, 'Sacas deve ser >= 1'),
  harvest: z.string().trim().min(1, 'Safra é obrigatória'),
  originLot: z.string().trim().max(2000, 'Lote de origem muito longo').optional().nullable(),
  location: z
    .string()
    .trim()
    .max(30, 'Local deve ter no máximo 30 caracteres')
    .optional()
    .nullable(),
  // receivedChannel saiu do form (LNW-D3): sem UI, todo lote nascia
  // 'in_person' — o backend segue aplicando esse default e aceitando o enum
  // completo pra um futuro seletor.
  notes: z.string().trim().max(500).optional().nullable(),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, 'Nome completo é obrigatório'),
  username: z.string().trim().min(1, 'Usuário é obrigatório'),
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
      { message: 'Telefone deve ter 10 ou 11 dígitos' }
    ),
});

export const emailChangeRequestSchema = z.object({
  email: z.string().trim().min(1, 'E-mail é obrigatório').email('E-mail inválido'),
});

export const emailChangeConfirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
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
        'Justificativa deve ter no máximo 10 palavras'
      ),
  })
  .refine((data) => data.reasonCode !== 'OTHER' || data.reasonText.length >= 1, {
    message: 'Justificativa obrigatória para "Outro motivo"',
    path: ['reasonText'],
  });
