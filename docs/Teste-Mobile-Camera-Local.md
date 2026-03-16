# Teste Mobile de Camera em Desenvolvimento Local

## Objetivo

Subir o sistema em HTTPS dentro da rede local para validar no celular:

- permissao de camera do navegador
- stream da camera traseira e frontal
- captura de imagem

Rota de smoke test incluida no projeto:

- `/dev/camera`

## Por que HTTPS e obrigatorio

No celular, `getUserMedia` normalmente exige contexto seguro. Em desenvolvimento isso significa:

- `https://localhost` no proprio aparelho, ou
- `https://IP_DO_PC:3000` com certificado confiavel

Sem isso, a pagina pode abrir e a camera continuar bloqueada.

## Scripts disponiveis

- `npm run dev:mobile:cert`
- `npm run dev:mobile:https`
- `npm run dev:mobile:url`

## Instalar mkcert no Ubuntu

O servidor local com `openssl` funciona como fallback, mas para camera no celular o caminho recomendado e `mkcert`.

```bash
sudo apt-get update
sudo apt-get install -y mkcert
mkcert -install
```

Se o `mkcert -install` reclamar de suporte NSS no Linux:

```bash
sudo apt-get install -y libnss3-tools
mkcert -install
```

## Fluxo recomendado

1. Descubra o IP do seu computador na rede local:

```bash
hostname -I
```

2. Gere o certificado incluindo o IP do computador:

```bash
DEV_LAN_HOSTS="192.168.0.25" npm run dev:mobile:cert
```

3. Suba o app em HTTPS:

```bash
npm run db:up
npm run prisma:generate
npm run prisma:migrate:deploy
DEV_LAN_HOSTS="192.168.0.25" npm run dev:mobile:https
```

4. Mostre as URLs esperadas:

```bash
DEV_LAN_HOSTS="192.168.0.25" npm run dev:mobile:url
```

5. Abra no computador:

```text
https://localhost:3000/dev/camera
```

6. Abra no celular, na mesma rede Wi-Fi:

```text
https://192.168.0.25:3000/dev/camera
```

## Confiar o certificado no celular

Se voce usou `mkcert`, descubra a pasta da CA local:

```bash
mkcert -CAROOT
```

Depois transfira o arquivo `rootCA.pem` dessa pasta para o celular e instale/confie o certificado no aparelho. Sem confiar na CA, o navegador do telefone pode bloquear a camera mesmo com HTTPS.

## Observacoes

- A rota `/dev/camera` so aparece em desenvolvimento. Em producao ela retorna `404`.
- Se a pagina abrir no celular mas a camera continuar bloqueada, o problema costuma ser certificado nao confiavel no aparelho.
- Se nao quiser usar `mkcert`, o projeto gera um certificado autoassinado com `openssl`, mas isso e apenas fallback.
