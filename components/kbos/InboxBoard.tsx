"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CONVERSATION_STATUS, INBOX_CHANNELS } from "@/lib/kbos/constants";

type Conversation = {
  id: string;
  contactId: string | null;
  channel: string;
  channelChatId: string;
  status: string;
  unreadCount: number;
  lastMessageAt: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactCompany: string | null;
  contactStatus: string | null;
  title: string | null;
  isGroup: boolean;
  lastPreview: string | null;
};

type Message = {
  id: string;
  senderType: string;
  content: string | null;
  mediaUrl: string | null;
  messageType: string;
  status: string;
  createdAt: string;
  senderName: string | null;
  mediaSrc: string | null;
};

/** Nome que aparece na lista e no topo do chat. */
function convName(c: Conversation): string {
  if (c.isGroup) return c.title || "Grupo do WhatsApp";
  return c.contactName || c.contactPhone || c.channelChatId.split("@")[0];
}

/** Cor estável por pessoa nos grupos (como no WhatsApp). */
const AUTHOR_HUES = [268, 292, 200, 160, 32, 340, 220];
function authorColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${AUTHOR_HUES[h % AUTHOR_HUES.length]} 70% 72%)`;
}

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: "✆",
  instagram: "◍",
  telegram: "➤",
  messenger: "☁",
  webchat: "◌",
};
const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(INBOX_CHANNELS.map((c) => [c.id, c.label]));
const STATUS_LABEL: Record<string, string> = Object.fromEntries(CONVERSATION_STATUS.map((s) => [s.id, s.label]));

const CONV_POLL_MS = 8000;
const MSG_POLL_MS = 4000;

function relTime(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  if (diff < 60_000) return "agora";
  if (diff < 3_600_000) return `há ${Math.floor(diff / 60_000)}min`;
  const d = new Date(t);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function msgTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function InboxBoard() {
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("whatsapp");
  // Pessoas primeiro: grupos ficam numa aba própria para não misturar com clientes.
  const [kind, setKind] = useState<"people" | "groups" | "all">("people");
  const [q, setQ] = useState("");
  // Busca com debounce: só o termo "assentado" dispara a consulta.
  const [qDebounced, setQDebounced] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Histórico com o id de origem: nunca exibe mensagens de outra conversa.
  const [msgs, setMsgs] = useState<{ convId: string | null; items: Message[] }>({ convId: null, items: [] });
  const [chatError, setChatError] = useState("");
  const [draft, setDraft] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState("image");
  const [showAttach, setShowAttach] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatStatus, setChatStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<string | null>(null);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  const loadConvs = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (statusFilter !== "all") p.set("status", statusFilter);
      if (channelFilter !== "all") p.set("channel", channelFilter);
      if (qDebounced) p.set("q", qDebounced);
      if (kind !== "all") p.set("kind", kind);
      const res = await fetch(`/api/conversations?${p.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar conversas.");
      setConvs(data.items || []);
      setUnreadTotal(data.unreadTotal ?? 0);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro.");
    }
  }, [statusFilter, channelFilter, qDebounced, kind]);

  const loadMsgs = useCallback(async (id: string, silent = true) => {
    try {
      const res = await fetch(`/api/conversations/${id}/messages?limit=100`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no histórico.");
      if (selectedRef.current !== id) return;
      setMsgs({ convId: id, items: data.items || [] });
      if (!silent) setChatError("");
    } catch (e) {
      if (!silent) setChatError(e instanceof Error ? e.message : "Erro.");
    }
  }, []);

  // Lista: carga inicial + polling otimizado (pausa com aba oculta).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch assíncrono: o setState só ocorre após o await.
    loadConvs();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadConvs();
    }, CONV_POLL_MS);
    return () => clearInterval(t);
  }, [loadConvs]);

  // Busca digitada: debounce de 350ms (filtros de status/canal recarregam na
  // hora). Antes, `q` entrava direto nas deps de `loadConvs` e cada tecla
  // disparava um fetch e reiniciava o polling.
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Chat: carrega ao selecionar + polling; marca como lida.
  useEffect(() => {
    if (!selectedId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch assíncrono: o setState só ocorre após o await.
    loadMsgs(selectedId, false);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") loadMsgs(selectedId);
    }, MSG_POLL_MS);
    const conv = convs.find((c) => c.id === selectedId);
    if (conv && conv.unreadCount > 0) {
      fetch(`/api/conversations/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markRead: true }),
      })
        .then(() => {
          setConvs((s) => s.map((c) => (c.id === selectedId ? { ...c, unreadCount: 0 } : c)));
          setUnreadTotal((u) => Math.max(0, u - conv.unreadCount));
        })
        .catch(() => {});
    }
    // Sem este cleanup, cada conversa aberta deixava um polling vivo.
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Auto-scroll p/ a última mensagem quando o chat atualiza.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs.items.length, selectedId]);

  const selected = useMemo(() => convs.find((c) => c.id === selectedId) ?? null, [convs, selectedId]);
  // Derivado (sem setState em efeito): só o histórico da conversa aberta.
  const shownMsgs = selectedId && msgs.convId === selectedId ? msgs.items : [];
  const effectiveStatus = chatStatus ?? selected?.status ?? "open";

  async function changeStatus(next: string) {
    if (!selected) return;
    setChatStatus(next);
    setConvs((s) => s.map((c) => (c.id === selected.id ? { ...c, status: next } : c)));
    try {
      await fetch(`/api/conversations/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
    } catch {
      loadConvs();
    } finally {
      setChatStatus(null);
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!selected || sending) return;
    const content = draft.trim();
    const media = mediaUrl.trim();
    if (!content && !media) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${selected.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content || undefined,
          mediaUrl: media || undefined,
          messageType: media ? mediaType : "text",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no envio.");
      setDraft("");
      setMediaUrl("");
      setShowAttach(false);
      loadMsgs(selected.id);
      loadConvs();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Erro no envio.");
    } finally {
      setSending(false);
    }
  }

  function bubble(m: Message, prev: Message | undefined) {
    const mine = m.senderType === "agent" || m.senderType === "ai";
    const showAuthor = !!selected?.isGroup && !mine && !!m.senderName && prev?.senderName !== m.senderName;
    const src = m.mediaSrc;
    const isReaction = m.messageType === "text" && /^Reagiu com /.test(m.content || "");
    if (isReaction) {
      return (
        <p key={m.id} className={`text-[12px] text-white/45 ${mine ? "text-right" : ""}`}>
          {m.senderName ? `${m.senderName} · ` : ""}
          {m.content} · {msgTime(m.createdAt)}
        </p>
      );
    }
    return (
      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            mine ? "rounded-br-md bg-[#4F12C7]/55 text-white" : "rounded-bl-md border border-white/10 bg-white/[0.06]"
          }`}
        >
          {showAuthor && (
            <p className="mb-0.5 text-[12px] font-semibold" style={{ color: authorColor(m.senderName || "") }}>
              {m.senderName}
            </p>
          )}
          {m.senderType === "ai" && <p className="mb-1 text-[10px] uppercase tracking-[0.2em] opacity-60">IA · auto</p>}
          {m.messageType === "image" && src ? (
            <a href={src} target="_blank" rel="noreferrer" className="mb-1.5 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={m.content || "Foto"} loading="lazy" className="max-h-72 min-h-16 min-w-24 rounded-xl bg-white/5 object-cover" />
            </a>
          ) : null}
          {m.messageType === "video" && src ? (
            <video controls preload="none" playsInline src={src} className="mb-1.5 max-h-72 w-full min-w-[220px] rounded-xl bg-black/40" />
          ) : null}
          {m.messageType === "audio" && src ? <audio controls preload="none" src={src} className="mb-1.5 w-full min-w-[220px]" /> : null}
          {m.messageType === "document" && src ? (
            <a href={src} target="_blank" rel="noreferrer" className="mb-1.5 flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 underline-offset-2 hover:underline">
              📎 <span className="truncate">{m.content || "Abrir documento"}</span>
            </a>
          ) : null}
          {!(m.messageType === "document" && src) && m.content ? <p className="whitespace-pre-wrap break-words">{m.content}</p> : null}
          {!m.content && !src ? <p className="italic opacity-50">Mensagem sem conteúdo</p> : null}
          <p className="mt-0.5 text-right text-[10px] tabular-nums text-white/45">
            {msgTime(m.createdAt)}
            {mine ? ` · ${m.status === "read" ? "✓✓ lida" : m.status === "delivered" ? "✓✓" : "✓"}` : ""}
          </p>
        </div>
      </div>
    );
  }

  const listPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1.5 p-3">
        {[{ id: "all", label: "Todas" }, ...CONVERSATION_STATUS].map((s) => (
          <button
            key={s.id}
            onClick={() => setStatusFilter(s.id)}
            className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-all duration-200 active:scale-95 ${
              statusFilter === s.id
                ? "bg-white font-bold text-black"
                : "border border-white/15 text-white/60 hover:border-white/40 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 px-3 pb-2">
        {(
          [
            { id: "people", label: "Pessoas" },
            { id: "groups", label: "Grupos" },
            { id: "all", label: "Tudo" },
          ] as const
        ).map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={`flex-1 rounded-xl px-3 py-2 text-[12px] font-medium transition active:scale-95 ${
              kind === k.id ? "bg-white/[0.12] text-white" : "text-white/55 hover:text-white"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2 px-3 pb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nome, telefone..."
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3.5 py-2 text-[13px] outline-none placeholder:text-white/25 focus:border-white/50"
        />
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          aria-label="Filtrar por canal"
          className="rounded-xl border border-white/15 bg-black/30 px-2.5 py-2 text-[13px] outline-none"
        >
          <option value="all" className="bg-[#1a1828]">Todos os canais</option>
          {INBOX_CHANNELS.map((c) => (
            <option key={c.id} value={c.id} className="bg-[#1a1828]">{c.label}</option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10">
        {convs.map((c) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition-all duration-150 ${
                active ? "bg-white/[0.08]" : "hover:bg-white/[0.04] active:bg-white/[0.06]"
              }`}
            >
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F12C7]/45 to-white/5 text-[15px] font-semibold uppercase">
                {c.isGroup ? "👥" : convName(c).replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1) || CHANNEL_ICON[c.channel] || "✉"}
                {c.unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[10px] font-bold text-black">
                    {c.unreadCount > 9 ? "9+" : c.unreadCount}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${c.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>{convName(c)}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-white/40">{relTime(c.lastMessageAt)}</span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] text-white/50">
                    {c.lastPreview || (c.isGroup ? "Grupo" : c.contactPhone || CHANNEL_LABEL[c.channel] || c.channel)}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-white/35">
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
        {convs.length === 0 && (
          <p className="p-8 text-center text-sm text-white/40">
            Nenhuma conversa aqui.
            <br />
            <span className="text-[12px]">Mensagens do WhatsApp aparecem aqui via webhook.</span>
          </p>
        )}
      </div>
    </div>
  );

  const chatPanel = !selected ? (
    <div className="hidden h-full items-center justify-center p-10 text-center md:flex">
      <div>
        <p className="text-4xl">✉</p>
        <p className="mt-3 text-sm text-white/50">Selecione uma conversa à esquerda.</p>
        {unreadTotal > 0 && <p className="mt-1 text-[12px] text-emerald-300">{unreadTotal} não lidas no total</p>}
      </div>
    </div>
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      {/* Cabeçalho do chat + contato CRM */}
      <div className="border-b border-white/10 p-3.5">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedId(null)} aria-label="Voltar à lista" className="rounded-lg border border-white/15 px-2.5 py-1.5 md:hidden">
            ←
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4F12C7]/45 to-white/5 font-bold uppercase">
            {selected.isGroup ? "👥" : convName(selected).slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{convName(selected)}</p>
            <p className="truncate text-[12px] text-white/50">
              {selected.isGroup ? "Grupo · " : ""}
              {CHANNEL_LABEL[selected.channel] || selected.channel}
              {selected.contactPhone ? ` · ${selected.contactPhone}` : ""}
              {selected.contactCompany ? ` · ${selected.contactCompany}` : ""}
            </p>
          </div>
          <select
            value={effectiveStatus}
            onChange={(e) => changeStatus(e.target.value)}
            aria-label="Status da conversa"
            className="rounded-xl border border-white/15 bg-black/30 px-2.5 py-2 text-[12px] uppercase tracking-wider outline-none"
          >
            {CONVERSATION_STATUS.map((s) => (
              <option key={s.id} value={s.id} className="bg-[#1a1828]">{s.label}</option>
            ))}
          </select>
        </div>
        {selected.contactId && (
          <Link
            href="/admin/crm"
            className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[12px] text-white/60 transition hover:border-white/30 hover:text-white"
          >
            <span>
              ◎ Contato no CRM{selected.contactStatus ? ` · ${selected.contactStatus}` : ""}
            </span>
            <span>Ver CRM →</span>
          </Link>
        )}
      </div>
      {chatError && (
        <div className="mx-3.5 mt-3 rounded-xl border border-rose-300/30 bg-rose-300/10 px-4 py-2.5 text-[13px] text-rose-100">{chatError}</div>
      )}
      {/* Bolhas */}
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3.5">
        {shownMsgs.map((m, i) => bubble(m, shownMsgs[i - 1]))}
        <div ref={bottomRef} />
        {shownMsgs.length === 0 && <p className="pt-10 text-center text-[13px] text-white/35">Sem mensagens ainda. Diga oi 👋</p>}
      </div>
      {/* Composer */}
      <form onSubmit={send} className="border-t border-white/10 p-3">
        {showAttach && (
          <div className="mb-2 flex gap-2">
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="URL do anexo (https://...)"
              inputMode="url"
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3.5 py-2 text-[13px] outline-none placeholder:text-white/25 focus:border-white/50"
            />
            <select value={mediaType} onChange={(e) => setMediaType(e.target.value)} aria-label="Tipo de anexo" className="rounded-xl border border-white/15 bg-black/30 px-2 py-2 text-[13px] outline-none">
              <option value="image" className="bg-[#1a1828]">Imagem</option>
              <option value="audio" className="bg-[#1a1828]">Áudio</option>
              <option value="document" className="bg-[#1a1828]">Doc</option>
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowAttach((s) => !s)}
            aria-label="Anexar mídia"
            className={`shrink-0 rounded-xl border px-3.5 text-lg transition active:scale-95 ${showAttach ? "border-white bg-white text-black" : "border-white/15 text-white/60 hover:text-white"}`}
          >
            +
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escreva uma mensagem..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm outline-none placeholder:text-white/25 focus:border-white/50"
          />
          <button
            type="submit"
            disabled={sending || (!draft.trim() && !mediaUrl.trim())}
            className="shrink-0 rounded-xl bg-gradient-to-r from-brand-blue to-brand-mag px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.12em] text-white transition hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            {sending ? "..." : "➤"}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 py-3 text-sm text-amber-100">
          {error.includes("DATABASE_URL") || error.includes("connect")
            ? "Banco não conectado — defina DATABASE_URL e rode `npx drizzle-kit push` (migration 0003_fase2_inbox)."
            : error}
        </div>
      )}
      {/* Desktop: 2 colunas. Mobile: lista OU chat (overlay full). */}
      <div className="hidden overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] md:grid md:h-[72vh] md:grid-cols-[340px_1fr]">
        <div className="min-h-0 border-r border-white/10">{listPanel}</div>
        <div className="min-h-0">{chatPanel}</div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] md:hidden">
        {!selectedId ? (
          <div className="max-h-[70vh]">{listPanel}</div>
        ) : (
          <div className="fixed inset-0 z-[60] flex flex-col bg-[#11101E]">{chatPanel}</div>
        )}
      </div>
    </div>
  );
}
