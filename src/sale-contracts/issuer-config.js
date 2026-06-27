// Fechamento (Fase C): emissor do contrato (D29). Reusa os dados conhecidos da
// empresa (mesmo COMPANY_INFO do laudo); o CNPJ vem por env (placeholder até o
// Flavio fornecer). A assinatura do dono (D35) ainda nao existe como asset —
// por ora o PDF imprime linha em branco.
const ISSUER = Object.freeze({
  name: 'Safras & Negócios',
  cityUf: 'São Sebastião do Paraíso/MG',
  phone: '(35) 3531-4046',
  address: 'Av. Oliveira Rezende, 1397 - Jardim Bernadete - São Sebastião do Paraíso - MG',
});

export function getContractIssuer() {
  const cnpj = (process.env.CONTRACT_ISSUER_CNPJ ?? '').trim();
  return {
    ...ISSUER,
    cnpj: cnpj || '(CNPJ a configurar)',
  };
}
