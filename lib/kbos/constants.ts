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
