# 2026-10-29 · Claude · Acesso ao projeto direto pelo painel

## O que mudou
- **Projeto → Acesso compartilhado no portal**: o campo virou busca. Digitando nome, e-mail ou empresa aparecem as contas do portal **e os contatos do CRM** (com e-mail). Um toque dá o acesso.
- Contato do CRM **sem conta no portal**: a conta é criada na hora (nome e WhatsApp vêm da ficha) e o acesso ao projeto é dado junto. Antes dava "Nenhuma conta com esse e-mail. Crie antes em CRM…".
- **E-mail que não está em lugar nenhum**: o painel pede nome e WhatsApp (opcional) ali mesmo e cria contato (status cliente, origem "projeto", empresa do projeto) + conta + acesso.
- Conta nova devolve um **link de acesso de uso único (24 h)** com botões "Copiar" e "Enviar no WhatsApp", igual ao da ficha do CRM.
- Diferente do "Acesso ao portal" da ficha, criar pelo projeto **não** torna a pessoa titular de outros projetos: só libera o projeto aberto.
- Arquivos: `lib/kbos/project-members.ts` (`searchMemberCandidates`, `ensureClientAccount`), `app/api/admin/projects/[id]/members/route.ts` (`GET ?q=`, `POST` com `name`/`phone`), `components/kbos/ProjectMembers.tsx`. Testes em `lib/kbos/__tests__/project-members.test.ts`.

## O que falta
- Nada obrigatório. Ideia: mesma busca no "Acesso" das empresas (`CompaniesBoard`).

## Regra de escopo do portal (pedido do Kayque)
- Cliente/lead do CRM **sem projeto ativo vinculado não vê nada** no portal.
- Projeto ativo = não entregue **ou** recorrente (contrato vale enquanto ativo). Entregue e não recorrente some do portal.
- Vínculos que valem: titular, acesso compartilhado no projeto, acesso ao principal (Grupo → operações) e acesso à empresa dado pelo admin. **"Mesma empresa" no CRM não dá acesso** (a ficha do CRM só liga os projetos ativos em que o contato é o cliente).
- Arquivos: `clientProjects`/`managedProjectIds` (`project-members.ts`), `clientLumeHub` (`companies.ts`), `grantPortalAccess` (`portal-access.ts`); `normalizePhone` em `lib/kbos/phone.ts`.
