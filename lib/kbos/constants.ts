// Constantes puras do KBOS — importável em client components
// (rbac.ts importa daqui; nunca importe rbac/db/schema no cliente).
import type { Role } from "./schema";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  designer: "Designer",
  editor: "Editor",
  fotografo: "Fotógrafo",
  programador: "Programador",
  cliente: "Cliente",
};

export const PIPELINE: { id: string; label: string }[] = [
  { id: "novo", label: "Novo" },
  { id: "briefing", label: "Briefing" },
  { id: "producao", label: "Em produção" },
  { id: "revisao", label: "Revisão" },
  { id: "aprovado", label: "Aprovado" },
  { id: "entregue", label: "Entregue" },
];

// Fase 1 — CRM + Kanban de vendas (client-safe: sem imports server).
export const CONTACT_STATUS = [
  { id: "lead", label: "Lead" },
  { id: "client", label: "Cliente" },
  { id: "partner", label: "Parceiro" },
  { id: "archived", label: "Arquivado" },
] as const;

export const DEAL_STAGES = [
  { id: "prospecting", label: "Prospecção" },
  { id: "proposal", label: "Proposta" },
  { id: "negotiation", label: "Negociação" },
  { id: "won", label: "Ganho" },
  { id: "lost", label: "Perdido" },
] as const;

// Fase 2 — Inbox omnichannel (client-safe: sem imports server).
export const INBOX_CHANNELS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "telegram", label: "Telegram" },
  { id: "messenger", label: "Messenger" },
  { id: "webchat", label: "Webchat" },
] as const;

export const CONVERSATION_STATUS = [
  { id: "open", label: "Aberta" },
  { id: "pending", label: "Pendente" },
  { id: "closed", label: "Fechada" },
] as const;

// Fase 3 — campanhas + assistente (client-safe: sem imports server).
export const CAMPAIGN_STATUS = [
  { id: "draft", label: "Rascunho" },
  { id: "scheduled", label: "Agendada" },
  { id: "running", label: "Disparando" },
  { id: "completed", label: "Concluída" },
  { id: "failed", label: "Falhou" },
] as const;

export const CAMPAIGN_TARGETS = [
  { id: "all", label: "Todos (sem arquivados)" },
  { id: "lead", label: "Leads" },
  { id: "client", label: "Clientes" },
  { id: "partner", label: "Parceiros" },
  { id: "archived", label: "Arquivados" },
] as const;

// Fase 4 — financeiro + agenda (client-safe: sem imports server).
export const FINANCE_TYPES = [
  { id: "income", label: "Receita" },
  { id: "expense", label: "Despesa" },
] as const;

export const FINANCE_STATUS = [
  { id: "pending", label: "Pendente" },
  { id: "paid", label: "Pago" },
  { id: "overdue", label: "Vencido" },
] as const;
