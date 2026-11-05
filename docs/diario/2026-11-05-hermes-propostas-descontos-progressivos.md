# 2026-11-05 — Hermes — Propostas Comerciais e Aceite com Descontos Progressivos PIX

## O que mudou
- **Condições Comerciais com Descontos Progressivos PIX (`lib/kbos/sale-plan.ts`, `lib/kbos/sales.ts`):**
  - Suporte a `progressiveDiscounts` (`1x: 10%`, `2x: 6%`, `3x: 3%`, `4x: 0%`) com divisão exata de centavos (`splitExactInstallments`), ajustando a 1ª parcela para que a soma das parcelas bata 100% com o valor final.
  - Prevenção de cumulatividade de descontos (`discountPercent` progressivo sobre o `baseTotal`).
  - Chave PIX padrão oficial (`DEFAULT_PIX_INFO = "Pix Picpay: (91) 9 9374-3109 — Kayque Brito"`) com fallback para `bankInfo` do orçamento.
- **Página Pública de Proposta e Aceite (`app/proposta/[token]/Proposal.tsx`, `app/api/proposals/[token]/route.ts`, `app/api/proposals/[token]/pdf/route.ts`):**
  - Redesign editorial dark (`#11101E`, `#E80EFD`, `#4F12C7`, `#EDE6EC`) com cards interativos de 1x a 4x, selo de economia à vista, tabela dinâmica de parcelas/vencimentos e download de PDF sincronizado (`?installments=1|2|3|4`).
  - Fluxo de pagamento por PIX direto com confirmação manual no KBOS e conversão automática de Lead em Cliente no 1º pagamento positivo confirmado (`app/api/finance/[id]/route.ts`, `app/api/transactions/[id]/route.ts`).
- **Gerador de PDF de 2 Páginas (`lib/kbos/pdf-generator.tsx`):**
  - Página 1 e Cláusula 3 (Página 2) refletem valor original, percentual de desconto progressivo, economia em reais, valor final contratado, cronograma exato de parcelas e chave PIX.
- **Preflight, Proteção Anti-Neon e Script Operacional (`lib/kbos/db.ts`, `scripts/kbos-preflight.mjs`, `scripts/recover-luana-prod.mjs`):**
  - Bloqueio do cluster Neon descontinuado (`ep-dawn-wildflower-b5k6i390`) por padrão em `lib/kbos/db.ts`.
  - Script `scripts/recover-luana-prod.mjs` com modos `--audit` (leitura segura), atualização de rascunhos e `--issue-links` (emissão dos links de aceite com `progressiveDiscounts: true` via API autenticada).
- **Testes Automatizados (`lib/kbos/__tests__/sale-plan.test.ts`, `sales.test.ts`, `pdf-generator.test.ts`, `db.test.ts`):**
  - Cobertura dos 4 cenários (1x, 2x, 3x, 4x) para Landing Page (R$ 2.500,00) e E-commerce e Gestão (R$ 9.800,00), imutabilidade pós-aceite e conversão Lead -> Cliente.

## O que falta
- Confirmação do Kayque para fast-forward merge em `main` (disparando deploy automático na VPS) e execução de `node scripts/recover-luana-prod.mjs --issue-links` para emitir os dois links definitivos da Luana Nakata / Sorella Import.
