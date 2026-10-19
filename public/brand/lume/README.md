# Lume — identidade visual (acervo inteligente)

Autor: Kayque Brito · parte do ecossistema KBOS. Conceito: luz que revela momentos; Criador + Explorador; humano + tecnologia.

## Arquivos
| Arquivo | Uso |
|---|---|
| `lume-symbol-dark.svg` | Símbolo para fundo escuro (#11101E) |
| `lume-symbol-light.svg` | Símbolo para fundo claro (#EDE6EC) |
| `lume-lockup-dark.svg` / `lume-lockup-light.svg` | Símbolo + "Lume" + "ACERVO INTELIGENTE" (viewBox 240×72) |
| `preview.html` | Folha da marca para revisão (abrir no navegador; segue o tema do sistema) |

Todos são SVG escritos à mão (sem imagens externas). O lockup usa a fonte Cottorway/Outfit com fallback; para impressão converta o texto em curvas.

## Paleta
`#11101E` fundo · `#EDE6EC` tinta · `#350C85` / `#4F12C7` apoio · `#E80EFD` somente no fim de degradês sutis.

## Assinatura
Ondas discretas (barras com degradê `#4F12C7 → #E80EFD`), fundo com degradê lento (~26 s), vidro com blur, bordas translúcidas. Tudo desliga com `prefers-reduced-motion`.

## Como o app local pode reaproveitar
Copie os SVGs para o app e use `<img src="lume-symbol-dark.svg">` ou inline. Este repositório **não altera** o app local do Acervo.

## No KBOS
Página `/admin/lume` (menu Produção → "Lume · acervo"), componente `components/kbos/lume/LumeMark.tsx`, validação do endereço em `lib/kbos/lume.ts`. O endereço fica só no navegador (localStorage); o KBOS não hospeda nem acessa o SSD.
