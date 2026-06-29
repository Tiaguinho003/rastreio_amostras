// Fechamento (Fase C): emissor do contrato (D29) — dados reais da empresa, como no
// cabeçalho do contrato legado (S60). O CNPJ pode vir por env (CONTRACT_ISSUER_CNPJ);
// default = o real. A assinatura do dono (D35) ainda nao existe como asset — por ora
// o PDF imprime linha em branco. Campos separados p/ o cabeçalho alinhado à direita.
const ISSUER = Object.freeze({
  name: 'Safras Negócios e Intermediações Eireli - ME',
  addressStreet: 'Av. Oliveira Resende, 1397',
  district: 'Jardim Bernadete',
  city: 'São Sebastião do Paraíso',
  cityUf: 'São Sebastião do Paraíso - MG',
  phone: '(35) 3531-4046',
});

// Conta bancaria FIXA da corretora (D74) — usada no rodape do Espelho de
// Corretagem ("DADOS BANCARIOS PARA PAGAMENTO"), onde o cliente paga a corretagem.
// Defaults = a conta real (SICREDI), com override por env (mesmo padrao do CNPJ).
const ISSUER_BANK = Object.freeze({
  bankName: 'SICREDI',
  bankAgency: '0361',
  bankAccount: '83515-3',
});

function envOr(name, fallback) {
  const value = (process.env[name] ?? '').trim();
  return value || fallback;
}

export function getContractIssuer() {
  return {
    ...ISSUER,
    cnpj: envOr('CONTRACT_ISSUER_CNPJ', '23.490.860/0001-56'),
    bankName: envOr('CONTRACT_ISSUER_BANK_NAME', ISSUER_BANK.bankName),
    bankAgency: envOr('CONTRACT_ISSUER_BANK_AGENCY', ISSUER_BANK.bankAgency),
    bankAccount: envOr('CONTRACT_ISSUER_BANK_ACCOUNT', ISSUER_BANK.bankAccount),
  };
}
