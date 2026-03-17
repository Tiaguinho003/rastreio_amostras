# Teste Mobile de Camera em Development

Status: Suporte tecnico  
Escopo: validar camera do navegador em celular durante desenvolvimento local  
Ultima revisao: 2026-03-16  
Documentos relacionados: `docs/Operacao-e-Runtime.md`, `README.md`

## Objetivo

Subir o sistema em HTTPS dentro da rede local para validar no celular:

1. permissao de camera do navegador;
2. stream da camera traseira e frontal;
3. captura de imagem.

Rota de teste incluida no projeto:

1. `/dev/camera`

## Por que HTTPS e obrigatorio

Em celular, `getUserMedia` normalmente exige contexto seguro. Em development isso significa:

1. `https://localhost` no proprio aparelho; ou
2. `https://IP_DO_PC:3000` com certificado confiavel.

Sem isso, a pagina pode abrir e a camera continuar bloqueada.

## Scripts disponiveis

1. `npm run dev:mobile:cert`
2. `npm run dev:mobile:https`
3. `npm run dev:mobile:url`

## Preparacao recomendada

1. copiar o env canonico de development:

```bash
cp env/examples/development.env.example .env.development
```

2. subir o banco e aplicar a base:

```bash
scripts/runtime/compose.sh development up -d db
scripts/runtime/migrate.sh development
scripts/runtime/seed.sh development
```

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

1. descubra o IP do seu computador na rede local:

```bash
hostname -I
```

2. gere o certificado incluindo o IP do computador:

```bash
DEV_LAN_HOSTS="192.168.0.25" npm run dev:mobile:cert
```

3. suba o app em HTTPS:

```bash
DEV_LAN_HOSTS="192.168.0.25" npm run dev:mobile:https
```

4. mostre as URLs esperadas:

```bash
DEV_LAN_HOSTS="192.168.0.25" npm run dev:mobile:url
```

5. abra no computador:

```text
https://localhost:3000/dev/camera
```

6. abra no celular, na mesma rede Wi-Fi:

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

1. A rota `/dev/camera` so existe em development.
2. Se a pagina abrir no celular mas a camera continuar bloqueada, o problema costuma ser certificado nao confiavel no aparelho.
3. Se nao quiser usar `mkcert`, o projeto gera certificado autoassinado com `openssl`, mas isso e fallback.
