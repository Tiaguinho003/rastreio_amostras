import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Guarda do ciclo SN (SN-D15). Roda DEPOIS do `next build`.
//
// O QUE ELE PROTEGE. As 8 rotas do route group (app) sao pre-renderizadas, e o
// `useSearchParams()` do layout do grupo derruba a fronteira de Suspense pra
// renderizacao no cliente. Disso saem DUAS garantias das quais o codigo depende
// hoje, e nenhuma das duas esta escrita em lugar nenhum a nao ser aqui:
//
//   1. Pagina autenticada NUNCA renderiza no servidor. E o que torna seguro ler
//      snapshot de lista no inicializador do `useState` (SN-D7/SN-D9, 6
//      arquivos dependem disso — ver skill `data-tables`).
//   2. O portao verde do gate nao entra no HTML servido. Se entrar, os bytes de
//      8 rotas mudam, o cache do service worker precisa de `CACHE_NAME` novo, e
//      o portao passa a precisar da rede de seguranca em CSS que ele desligou
//      de proposito (skill `containers`).
//
// Uma linha basta pra derrubar as duas: `export const dynamic`, `revalidate = 0`
// ou um `cookies()` no layout raiz. Nada no build reclama — o app so passa a
// servir outra coisa. Este check e o unico lugar onde isso vira erro.
//
// A `.fv-boot` RAIZ, ao contrario, TEM que estar no HTML servido: e ela que faz
// a primeira pintura ser verde em vez de branca (SN-D2, F5). Some dela = o
// buraco branco entre a tela do SO e o app voltou.

const APP_GROUP_DIR = join('app', '(app)');
const BUILD_HTML_DIR = join('.next', 'server', 'app');

// Rotas publicas (fora do route group) que tambem recebem a caixa raiz, porque
// ela mora no layout RAIZ. Servem de controle: se a caixa sumir SO nas
// autenticadas, o problema e o gate; se sumir em todas, e o `BootScreen`.
//
// 🔴 So paginas de verdade entram aqui. Rota de REDIRECT (`/forgot-password`,
// `/informe`, `/resumo`, `/embarques`) chama `redirect()` no corpo, o que aborta
// a arvore antes de qualquer pintura: o .html e um stub sem `<body>` util e
// `fv-boot=0` e o resultado CERTO. Foi o primeiro falso positivo deste check.
const PUBLIC_ROUTES = ['login', 'offline', 'maintenance'];

/**
 * Conta usos de uma classe em atributos `class="..."`, como palavra inteira.
 * Nao casa com CSS: se o Next um dia embutir a folha de estilo no documento,
 * um `grep` cru por `is-hold` acharia a REGRA e daria falso positivo.
 */
function countClassUse(html, className) {
  const classAttr = /class="([^"]*)"/g;
  let count = 0;
  let match;
  while ((match = classAttr.exec(html)) !== null) {
    if (match[1].split(/\s+/).includes(className)) {
      count += 1;
    }
  }
  return count;
}

/** Rotas estaticas de 1o nivel do route group — as que viram um .html proprio. */
function listAuthenticatedRoutes() {
  return readdirSync(APP_GROUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('['))
    .map((entry) => entry.name)
    .sort();
}

const failures = [];
const rows = [];

function check(route, { expectGate }) {
  const htmlPath = join(BUILD_HTML_DIR, `${route}.html`);

  if (!existsSync(htmlPath)) {
    failures.push(
      `${route}: ${htmlPath} nao existe — a rota deixou de ser pre-renderizada.\n` +
        `    Se foi de proposito, o gate do layout do grupo (app) passa a ser HIDRATADO:\n` +
        `    reveja a SN-D15 no doc do ciclo SN antes de afrouxar este check.`
    );
    return;
  }

  const html = readFileSync(htmlPath, 'utf8');
  const boot = countClassUse(html, 'fv-boot');
  const hold = countClassUse(html, 'is-hold');
  const shell = countClassUse(html, 'app-shell-root');

  rows.push(`  ${route.padEnd(16)} fv-boot=${boot}  is-hold=${hold}  app-shell-root=${shell}`);

  if (boot === 0) {
    failures.push(
      `${route}: a caixa verde do layout raiz sumiu do HTML servido.\n` +
        `    E ela que faz a primeira pintura ser verde (SN-D2, F5). Sem ela, o buraco branco\n` +
        `    entre a tela do SO e o app voltou.`
    );
  } else if (boot > 1) {
    failures.push(
      `${route}: ${boot} caixas \`.fv-boot\` no HTML servido, esperava 1.\n` +
        `    So a do layout raiz deve chegar ao documento; ver a falha do portao abaixo.`
    );
  }

  if (!expectGate) {
    if (hold !== 0) {
      failures.push(
        `${route}: o portao \`.fv-boot.is-hold\` foi PRE-RENDERIZADO (${hold}).\n` +
          `    Os bytes servidos mudaram: bumpe o CACHE_NAME do public/sw.js e devolva a rede\n` +
          `    de seguranca em CSS ao portao — ele so pode viver sem ela enquanto for so-cliente.`
      );
    }

    if (shell !== 0) {
      failures.push(
        `${route}: o shell foi renderizado no SERVIDOR (${shell} x \`.app-shell-root\`).\n` +
          `    Isso quebra a premissa de que pagina autenticada nunca renderiza no servidor —\n` +
          `    e com ela a seguranca de ler snapshot no inicializador do \`useState\` (SN-D7).`
      );
    }
  }
}

const authenticated = listAuthenticatedRoutes();

if (authenticated.length === 0) {
  console.error(`Nenhuma rota encontrada em ${APP_GROUP_DIR} — o check nao tem o que verificar.`);
  process.exitCode = 1;
} else {
  console.log(`Invariantes de pre-render — ${authenticated.length} rotas autenticadas + controle:`);

  for (const route of authenticated) {
    check(route, { expectGate: false });
  }

  // As publicas nao passam pelo gate: so a caixa raiz e conferida nelas.
  for (const route of PUBLIC_ROUTES) {
    check(route, { expectGate: false });
  }

  console.log(rows.join('\n'));

  if (failures.length > 0) {
    console.error(`\n${failures.length} invariante(s) quebrada(s):\n`);
    for (const failure of failures) {
      console.error(`  - ${failure}\n`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nOk: caixa raiz presente, portao fora do HTML e shell so no cliente.');
  }
}
