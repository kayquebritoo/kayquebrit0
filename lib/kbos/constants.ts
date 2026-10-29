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

export const PIPELINE: { id: string; label: string; color: string }[] = [
  { id: "novo", label: "Novo", color: "#9a93a8" },
  { id: "briefing", label: "Briefing", color: "#4DA3FF" },
  { id: "producao", label: "Em produção", color: "#8a6cf0" },
  { id: "revisao", label: "Revisão", color: "#f5c46e" },
  { id: "aprovado", label: "Aprovado", color: "#2dd4bf" },
  { id: "entregue", label: "Entregue", color: "#22c55e" },
];

export const PIPELINE_COLORS: Record<string, string> = Object.fromEntries(
  PIPELINE.map((s) => [s.id, s.color]),
);

// Etapas de conteúdo do calendário editorial (cores sólidas, sem degradê).
export const POST_STAGES = [
  { id: "roteiro", label: "Roteiro", color: "#9a93a8" },
  { id: "captacao", label: "Captação", color: "#4DA3FF" },
  { id: "producao", label: "Produção", color: "#8a6cf0" },
  { id: "aprovacao", label: "Aprovação", color: "#f5c46e" },
  { id: "ajustes", label: "Ajustes", color: "#ff8a3d" },
  { id: "aprovado", label: "Aprovado", color: "#2dd4bf" },
  { id: "agendado", label: "Agendado", color: "#f472b6" },
  { id: "postado", label: "Publicado", color: "#22c55e" },
  { id: "erro", label: "Erro", color: "#ff5c5c" },
  { id: "cancelado", label: "Cancelado", color: "#5a5566" },
] as const;

export const POST_STAGE_COLORS: Record<string, string> = Object.fromEntries(
  POST_STAGES.map((s) => [s.id, s.color]),
);

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

// Funil do briefing (enum `kbos_briefing_status`), com rótulos para a UI.
export const BRIEFING_STATUS = [
  { id: "novo", label: "Recebido" },
  { id: "em_analise", label: "Em análise" },
  { id: "aprovado", label: "Aprovado" },
  { id: "contrato_gerado", label: "Contrato gerado" },
  { id: "arquivado", label: "Arquivado" },
] as const;

// Orçamentos (client-safe: sem imports server).
export const BUDGET_STATUS = [
  { id: "draft", label: "Rascunho" },
  { id: "sent", label: "Enviado" },
  { id: "approved", label: "Aprovado" },
  { id: "completed", label: "Concluído" },
  { id: "cancelled", label: "Cancelado" },
  // Legado: orçamentos antigos marcados como recusados.
  { id: "rejected", label: "Recusado" },
] as const;

// Chave Pix padrão pré-preenchida no formulário de orçamento.
export const DEFAULT_PIX_INFO = "Pix Picpay: (91) 9 9374-3109 — Kayque Brito";
