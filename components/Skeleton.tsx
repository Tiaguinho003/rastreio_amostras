'use client';

// Kit de esqueleto (F4 do ciclo SN, SN-D10). Molde do `LoadError.tsx`: peca
// compartilhada que so monta o markup em cima da classe canonica do kit
// (`.fv-skel-*` no `globals.css`).
//
// O que isto substitui: `Array.from({ length: n }).map(...)` repetido SETE
// vezes com o mesmo card, e o laco aninhado (linhas × colunas) do esqueleto de
// tabela repetido CINCO vezes. Dois arquivos ja tinham extraido um helper
// local — o pedido pelo primitivo estava escrito no codigo.
//
// 🔴 A regiao `aria-live` NAO mora aqui: ela precisa estar sempre no DOM pra
// anunciar, e estas pecas montam e desmontam. Ver `LoadingLive.tsx`.

/** Uma barra de texto. A largura vem de quem usa (celula, grid, `style`). */
export function SkeletonLine({ className }: { className?: string }) {
  return <span className={`fv-skel-line${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}

/** Um quadrado de icone/avatar. */
export function SkeletonBox({ className }: { className?: string }) {
  return <span className={`fv-skel-box${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}

/**
 * N cards no formato da lista. A ALTURA e da pagina (o kit so da superficie e
 * raio) — passe a classe de escopo em `className` quando o card final nao tiver
 * a altura do piso.
 */
export function SkeletonCards({ count, className }: { count: number; className?: string }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`fv-skel-card-${i}`}
          className={`fv-skel-card${className ? ` ${className}` : ''}`}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

/**
 * N linhas de esqueleto para o `<tbody>` de uma `.fv-table`. `columns` tem que
 * bater com o numero de `<col>` do colgroup — celula a menos desalinha a tabela
 * inteira enquanto carrega (data-tables §5).
 */
export function SkeletonTableRows({ rows, columns }: { rows: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={`fv-skel-row-${row}`} className="fv-table-skel-row" aria-hidden="true">
          {Array.from({ length: columns }).map((__, cell) => (
            <td key={`fv-skel-cell-${cell}`}>
              <SkeletonLine />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
