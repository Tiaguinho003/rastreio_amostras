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

export function getContractIssuer() {
  const cnpj = (process.env.CONTRACT_ISSUER_CNPJ ?? '').trim();
  return {
    ...ISSUER,
    cnpj: cnpj || '23.490.860/0001-56',
  };
}
