# Bipador Goldensky J32W — Guia de configuracao

Este documento descreve como configurar o leitor de codigo de barras / QR code
**Goldensky J32W** (USB sem fio, 2D) para funcionar com a leitura global de QR
do sistema de rastreio de amostras.

> **Resumo rapido**: o bipador deve estar em modo HID Keyboard (padrao),
> configurado para emitir o **prefixo STX (`\u0002`)** antes do payload e o
> **sufixo CR (Enter)** apos o payload.

---

## Como o sistema usa o bipador

A PWA mantem um listener global de teclado em `lib/scanner/`. Quando o
operador bipa um QR em qualquer tela do sistema (exceto telas publicas como
login), o listener:

1. Detecta o prefixo `\u0002` (STX) e entra em "modo captura"
2. Acumula todos os caracteres subsequentes ate encontrar `Enter` ou `Tab`
3. Resolve o payload chamando `GET /api/v1/samples/resolve?qr=...`
4. Redireciona para `/samples/[id]?source=scanner`

Durante a captura, nenhum caractere vaza para inputs da pagina — o prefixo
permite preventDefault agressivo desde o primeiro caractere.

**Sem o prefixo**, o sistema entra em modo fallback (deteccao por velocidade
de digitacao). Funciona mas tem limitacoes — os caracteres lidos aparecem
momentaneamente em qualquer campo focado antes de serem interceptados. Por
isso **sempre configure o prefixo** em producao.

---

## Requisitos

| Requisito                         | Valor esperado                 |
| --------------------------------- | ------------------------------ |
| Modo de comunicacao               | USB HID Keyboard               |
| Prefixo                           | `\u0002` (STX, code 02 hex)    |
| Sufixo                            | `CR` (Carriage Return / Enter) |
| Layout de teclado do receptor USB | `EUA` (English US)             |
| Tipos de codigo habilitados       | QR Code 2D (padrao)            |

---

## Passos de configuracao

### 1. Entre em modo de programacao

No manual do J32W (secao "Setup" ou "Configuration"), ha um bipe-codigo
chamado **"Enter Setup"** ou **"Programming Mode"**. Bipe esse codigo antes
de qualquer alteracao.

### 2. Confirme o modo HID Keyboard

Bipe o codigo **"USB HID Keyboard"** (geralmente descrito como "USB-KBW" no
manual Goldensky). Esse e o modo padrao da maioria dos bipadores, mas vale
confirmar se nao foi alterado antes.

### 3. Defina o layout do teclado

Bipe o codigo **"US Keyboard"** (layout americano). Isso garante que
caracteres como `-`, `_`, `/`, `.` saiam corretos. Evite `BR-ABNT2` — as
teclas de simbolos podem resultar em caracteres errados no navegador.

### 4. Defina o prefixo STX

Essa e a parte critica. O codigo `\u0002` e o caractere de controle STX
(Start of Text), representado em hexadecimal como `02`.

No manual, procure por **"Prefix"** ou **"Add Prefix"** e siga o processo:

1. Bipe **"Set Prefix"**
2. Bipe os digitos hexadecimais: `0`, `2` (conforme a tabela ASCII do manual)
3. Bipe **"Save"** ou **"Confirm"**

Se o manual usar o formato decimal, o valor e `02` (decimal 2). Se usar o
formato "ASCII full", procure por "STX".

### 5. Confirme o sufixo CR (Enter)

O sufixo CR geralmente vem ativado de fabrica. Para conferir, bipe:

1. **"Add Suffix"**
2. **"CR"** ou bipe o codigo hexadecimal `0D`
3. **"Save"**

### 6. Saia do modo de programacao

Bipe **"Exit Setup"** ou **"Save and Exit"**.

### 7. Teste

Abra um editor de texto simples (Notepad, nano) e bipe qualquer QR code.
O resultado deve ser algo como:

```
[caractere invisivel]L-12345
```

Onde `[caractere invisivel]` e o STX (nao e impresso na maioria dos
editores, mas ocupa posicao). Apos `L-12345` o cursor deve pular para a
proxima linha (sufixo CR/Enter).

Se voce ver `L-12345` sem o STX, o prefixo nao foi aplicado — revise o passo 4. Se o texto sair com caracteres estranhos (`L_12345` no lugar de
`L-12345`), o layout de teclado esta errado — revise o passo 3.

---

## Troubleshooting

### Bipa mas nao abre a amostra no sistema

Causas possiveis:

- **Navegador nao esta focado**: o operador precisa estar com uma aba do
  sistema ativa (nao minimizada, nao em outro programa). Como o bipador e
  um teclado HID, so a janela focada recebe os eventos.
- **Pagina publica**: telas como `/login`, `/forgot-password` e
  `/reset-password` tem o scanner desativado intencionalmente — o usuario
  precisa estar logado.
- **QR nao reconhecido**: o sistema mostra um toast de erro
  "QR nao reconhecido" com o conteudo que foi lido. Compare com o valor
  esperado (deveria ser o `internalLotNumber` ou o UUID da amostra).
- **Sessao expirada**: o sistema mostra um toast pedindo login novamente.

### Caracteres estranhos no lugar do lote

- **Layout de teclado errado**: refaca o passo 3 (US Keyboard)
- **Acentos ou caracteres extendidos no lote**: evite isso ao gerar os
  lotes (apenas ASCII). O QR gerado hoje usa `internalLotNumber ?? id`,
  ambos ASCII.

### Bipa duas vezes o mesmo QR mas so a primeira funciona

Comportamento esperado na mesma sessao de navegacao rapida. O sistema
mostra um toast "Amostra ja aberta" quando a amostra bipada coincide com
a que ja esta na tela.

### Prefixo nao funciona depois da configuracao

- Alguns modelos exigem gravar multiplos codigos `SET PREFIX` +
  `HEX 0` + `HEX 2` + `SAVE`. Consulte o PDF oficial do manual Goldensky
  para o J32W — cada modelo tem uma sequencia ligeiramente diferente.
- Se o prefixo resistir a configuracao, o sistema ainda funciona em modo
  timing fallback (sem preventDefault perfeito). Mas e fortemente
  recomendado insistir na configuracao do prefixo antes de ir pra producao.

### Bipador desconecta / bateria fraca

- O J32W e sem fio. Use o cabo USB para carregar o dongle/bipador.
- Verifique o LED de status no bipador.

---

## Testando localmente sem bipador

Para testar a integracao do sistema sem bipador fisico, voce pode simular
o input via JavaScript no console do navegador:

```js
// Cola no console do navegador com a PWA aberta em qualquer pagina
const scan = (payload) => {
  const fire = (key) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  fire('\u0002');
  for (const ch of payload) fire(ch);
  fire('Enter');
};

scan('L-12345'); // substitua por um lote real
```

O sistema deve reagir como se um bipador real tivesse disparado.

---

## Referencias

- Codigo da integracao: `lib/scanner/`
- Componente que recebe os scans: `lib/scanner/ScannerBridge.tsx`
- Logica pura de buffer: `lib/scanner/scan-buffer.js`
- Testes unitarios: `tests/scanner-buffer.test.js`
- Endpoint de resolucao: `GET /api/v1/samples/resolve` (em
  `app/api/v1/samples/resolve/`)

---

## Pendencia: anexar manual oficial

O PDF original do manual Goldensky J32W com os bipe-codigos de programacao
ainda precisa ser anexado a este diretorio. Ate la, use as descricoes gerais
acima — todos os bipadores HID 2D chineses seguem padroes muito parecidos.

Quando tiver o PDF em maos, salve como:

```
docs/hardware/bipador-goldensky-j32w-manual.pdf
```

E atualize esta documentacao com as referencias de pagina exatas dos
bipe-codigos usados.
