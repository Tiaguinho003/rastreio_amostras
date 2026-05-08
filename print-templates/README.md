# Print templates

Templates HTML/CSS imprimíveis usados em operação física (fora do app).
Cada template é um arquivo `index.html` self-contained — abrir no navegador
e usar `Ctrl+P` (ou `Cmd+P`) para imprimir ou salvar como PDF.

## `classification-form/`

Ficha unificada de classificação. **6 fichas por A4** (3 linhas × 2 colunas).

Especificações da Fase Q.cls.2:

- Labels em CAIXA ALTA
- Área da ficha aumentada (margem do A4 e gap entre fichas reduzidos)
- Fonte ligeiramente maior que o PDF antigo
- Sem campo de tipo — `ClassificationType` é selecionado depois no app, não na ficha

### Como ajustar

Edite as variáveis CSS no topo de `index.html`:

| Variável        | Padrão | Efeito                                              |
| --------------- | ------ | --------------------------------------------------- |
| `--page-margin` | `5mm`  | Margem externa do A4. Reduzir → fichas maiores      |
| `--grid-gap`    | `3mm`  | Espaço entre fichas. Reduzir → fichas mais próximas |
| `--label-size`  | `8pt`  | Tamanho dos labels (PADR., P18, etc.)               |
| `--field-h`     | `11mm` | Altura mínima de cada linha de campo                |

### Como imprimir

1. Abrir `print-templates/classification-form/index.html` no navegador
2. `Ctrl+P` / `Cmd+P`
3. Configurações da impressora:
   - **Tamanho do papel**: A4
   - **Margens**: Padrão (o `@page` do CSS controla a margem real)
   - **Cor**: preto e branco
   - **Cabeçalho/rodapé do navegador**: desativar
4. Imprimir ou salvar como PDF
