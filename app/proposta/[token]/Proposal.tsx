"use client";
import { useEffect, useMemo, useState } from "react";
import type { AcceptanceVerification, SaleSnapshot } from "@/lib/kbos/sales";
import { SERVICE_LABELS, SERVICE_TEMPLATES, installmentsTotal, type SalePlan } from "@/lib/kbos/sale-plan";
import CompanyProfileFields from "@/components/kbos/planning/CompanyProfileFields";
import type { CompanyProfile } from "@/lib/kbos/planning-model";
import { formatBRL } from "@/lib/kbos/budget-calc";
import { DEFAULT_PIX_INFO } from "@/lib/kbos/constants";

type LifecycleState = {
  proposalPresented: boolean;
  accepted: boolean;
  contractFormalized: boolean;
  paymentConfirmed: boolean;
  clientConverted: boolean;
  paidInstallments: number;
  totalInstallments: number;
};

type ProposalData = {
  snapshot: SaleSnapshot;
  plan: SalePlan;
  acceptedAt: string | null;
  signerName?: string | null;
  acceptance?: AcceptanceVerification | null;
  lifecycle?: LifecycleState;
  expiresAt: string;
  companyProfile: CompanyProfile;
  planningUrl: string | null;
};

const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.split("-").reverse().join("/");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { timeZone: "America/Belem" });
};

const fmtDateTime = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", {
        timeZone: "America/Belem",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};

const PAY_CONDITION_LABEL: Record<string, string> = {
  cash: "À vista (Pix ou transferência)",
  installments: "Parcelado conforme cronograma",
  card: "Cartão de crédito ou débito",
};

export default function Proposal({ token }: { token: string }) {
  const [data, setData] = useState<ProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [contract, setContract] = useState(false);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfDocKind, setPdfDocKind] = useState<"proposta" | "contrato">("proposta");
  const [pixCopied, setPixCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [selectedInstallments, setSelectedInstallments] = useState<number>(1);

  useEffect(() => {
    let active = true;
    fetch(`/api/proposals/${token}/`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Não foi possível carregar a proposta.");
        if (active) {
          setData(j);
          const initCount =
            j.snapshot?.installmentsCount ?? j.snapshot?.installments?.length ?? 1;
          setSelectedInstallments(initCount);
          if (j.companyProfile?.contactName && !name) {
            setName(j.companyProfile.contactName);
          }
        }
      })
      .catch((e) => {
        if (active) setError(e.message || "Não foi possível carregar a proposta.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    if (busy || uploading) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/proposals/${token}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName: name.trim(),
          contractAccepted: contract,
          manualAccepted: manual,
          installmentsCount:
            data?.plan.service === "mensal" ? undefined : selectedInstallments,
          companyProfile: data?.companyProfile,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível registrar o aceite.");
      setData((v) => {
        if (!v) return v;
        const acceptedSchedule =
          j.acceptance?.installments && j.acceptance.installments.length > 0
            ? j.acceptance.installments
            : v.snapshot.installments;
        const acceptedOpt = v.snapshot.interestFreeOptions?.find(
          (o) => o.count === acceptedSchedule.length,
        );
        return {
          ...v,
          snapshot: {
            ...v.snapshot,
            total: j.acceptance?.total ?? acceptedOpt?.total ?? v.snapshot.total,
            discountPercent: acceptedOpt?.discountPercent ?? v.snapshot.discountPercent,
            discountAmount: acceptedOpt?.discountAmount ?? v.snapshot.discountAmount,
            installments: acceptedSchedule,
            installmentsCount: acceptedSchedule.length,
          },
          acceptedAt: j.acceptedAt,
          signerName: j.signerName || name.trim(),
          acceptance: j.acceptance ?? v.acceptance,
          planningUrl: j.planningUrl,
          lifecycle: {
            proposalPresented: true,
            accepted: true,
            contractFormalized: true,
            paymentConfirmed: v.lifecycle?.paymentConfirmed ?? false,
            clientConverted: v.lifecycle?.clientConverted ?? false,
            paidInstallments: v.lifecycle?.paidInstallments ?? 0,
            totalInstallments: acceptedSchedule.length || 1,
          },
        };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar o aceite.");
    } finally {
      setBusy(false);
    }
  }

  const s = data?.snapshot;
  const plan = data?.plan;

  const activeOption = useMemo(() => {
    if (!s || plan?.service === "mensal") return null;
    const targetCount = data?.acceptedAt
      ? (s.installmentsCount ?? s.installments?.length ?? 1)
      : selectedInstallments;
    return s.interestFreeOptions?.find((o) => o.count === targetCount) ?? null;
  }, [s, plan?.service, data?.acceptedAt, selectedInstallments]);

  const cashOption = useMemo(() => {
    if (!s || plan?.service === "mensal") return null;
    return s.interestFreeOptions?.find((o) => o.count === 1) ?? null;
  }, [s, plan?.service]);

  const activeInstallments = useMemo(() => {
    if (!s) return [];
    if (data?.acceptedAt || plan?.service === "mensal") return s.installments || [];
    return activeOption?.installments || s.installments || [];
  }, [s, data?.acceptedAt, plan?.service, activeOption]);

  const financialSummary = useMemo(() => {
    if (!s) {
      return {
        subtotal: 0,
        discountPercent: 0,
        discountAmount: 0,
        finalTotal: 0,
        scheduleTotal: 0,
      };
    }
    const itemsSubtotal =
      s.baseTotal ??
      s.subtotal ??
      Math.round((s.items || []).reduce((acc, it) => acc + Number(it.total || 0), 0) * 100) / 100;
    const baseTotal = Number(s.total || 0);
    const scheduleTotal = activeInstallments.length ? installmentsTotal(activeInstallments) : baseTotal;

    if (s.progressiveDiscounts && activeOption) {
      const refBase = activeOption.baseTotal ?? itemsSubtotal;
      return {
        subtotal: refBase,
        discountPercent: activeOption.discountPercent ?? 0,
        discountAmount: activeOption.discountAmount ?? Math.max(0, Math.round((refBase - scheduleTotal) * 100) / 100),
        finalTotal: scheduleTotal,
        scheduleTotal,
      };
    }

    const explicitDiscount =
      s.discountAmount ?? Math.max(0, Math.round((itemsSubtotal - baseTotal) * 100) / 100);
    const cashDiscount =
      s.applyCashDiscount && baseTotal > scheduleTotal
        ? Math.round((baseTotal - scheduleTotal) * 100) / 100
        : 0;
    return {
      subtotal: itemsSubtotal > 0 ? itemsSubtotal : baseTotal,
      discountPercent: s.discountPercent ?? (s.discountType === "percent" ? Number(s.discountValue || 0) : 0),
      discountAmount: Math.round((explicitDiscount + cashDiscount) * 100) / 100,
      finalTotal: scheduleTotal,
      scheduleTotal,
    };
  }, [s, activeInstallments, activeOption]);

  const serviceCategoryLabel = plan ? SERVICE_LABELS[plan.service] || "Projeto" : "Projeto";
  const subtypeLabel = s?.subtype || plan?.subtype || null;
  const stages = plan ? SERVICE_TEMPLATES[plan.service] || SERVICE_TEMPLATES.site : [];
  const deadlineLabel =
    s?.deliveryDeadline ||
    plan?.deliveryDeadline ||
    (plan
      ? plan.service === "mensal"
        ? `Vigência de ${plan.months} mês(es) (${fmtDate(plan.startDate)} a ${fmtDate(plan.deliveryDate)})`
        : `${fmtDate(plan.startDate)} a ${fmtDate(plan.deliveryDate)}`
      : "Conforme cronograma");
  const revisionsCount = s?.revisionsCount ?? 2;

  const installmentsQuery =
    !data?.acceptedAt && plan?.service !== "mensal" ? `&installments=${selectedInstallments}` : "";
  const pdfInlineUrl = `/api/proposals/${token}/pdf/?inline=1${pdfDocKind === "contrato" ? "&doc=contrato" : ""}${installmentsQuery}`;
  const pdfDownloadUrl = data?.acceptedAt
    ? `/api/proposals/${token}/pdf/?doc=aceito`
    : `/api/proposals/${token}/pdf/${plan?.service !== "mensal" ? `?installments=${selectedInstallments}` : ""}`;
  const contractDownloadUrl = `/api/proposals/${token}/pdf/?doc=contrato`;
  const pixInfo = s?.bankInfo?.trim() || DEFAULT_PIX_INFO;

  const copyPix = async () => {
    try {
      await navigator.clipboard.writeText(pixInfo);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2500);
    } catch {
      /* fallback silencioso */
    }
  };

  const copyVerificationCode = async () => {
    const code = data?.acceptance?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } catch {
      /* fallback silencioso */
    }
  };

  return (
    <div className="kbos min-h-screen bg-[#11101E] text-[#EDE6EC] selection:bg-[#4F12C7]/40 selection:text-white">
      {/* Barra superior translúcida com acesso rápido ao PDF */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#11101E]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-kayque.png"
              alt="Studio Kayque Brito"
              className="h-7 w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="flex flex-col">
              <span className="font-display text-xs font-bold tracking-[0.22em] text-[#EDE6EC]">
                STUDIO KAYQUE BRITO
              </span>
              <span className="text-[11px] text-[#BDB7BC]">
                {s ? `Proposta Comercial ${s.code}` : "Proposta Comercial"}
              </span>
            </div>
          </div>

          {s && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPdfDocKind("proposta");
                  setShowPdfViewer((v) => !v);
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-[#EDE6EC] transition hover:border-white/35 hover:bg-white/[0.08] active:scale-[0.98]"
              >
                {showPdfViewer ? "Ocultar visualização PDF" : "Visualizar proposta em PDF"}
              </button>
              <a
                href={pdfDownloadUrl}
                download
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#4F12C7] to-[#E80EFD] px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-[#4F12C7]/25 transition hover:opacity-95 active:scale-[0.98]"
              >
                {data?.acceptedAt ? "Baixar Proposta Aceita (PDF)" : "Baixar PDF"}
              </a>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-200"
          >
            <p className="font-semibold">Atenção</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {loading && !s && !error && (
          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.02] p-8">
            <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-white/10" />
            <div className="h-24 w-full animate-pulse rounded-2xl bg-white/5" />
            <p className="text-sm text-[#BDB7BC]">Carregando proposta comercial e termos…</p>
          </div>
        )}

        {s && data && plan && (
          <>
            {/* Visualizador integrado de PDF (sob demanda) */}
            {showPdfViewer && (
              <section
                aria-label="Visualizador de PDF integrado"
                className="overflow-hidden rounded-3xl border border-white/15 bg-[#161527] shadow-2xl"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                      Documento Oficial Integrado · 2 Páginas (A4)
                    </p>
                    <p className="text-sm font-medium text-[#EDE6EC]">
                      {pdfDocKind === "contrato"
                        ? `Instrumento Particular de Prestação de Serviços (${s.code})`
                        : `Resumo Comercial + Instrumento Contratual (${s.code})`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {data.acceptedAt && (
                      <div className="flex rounded-xl border border-white/10 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setPdfDocKind("proposta")}
                          className={`rounded-lg px-3 py-1.5 transition ${
                            pdfDocKind === "proposta"
                              ? "bg-white/15 font-medium text-white"
                              : "text-[#BDB7BC] hover:text-white"
                          }`}
                        >
                          Proposta Aceita
                        </button>
                        <button
                          type="button"
                          onClick={() => setPdfDocKind("contrato")}
                          className={`rounded-lg px-3 py-1.5 transition ${
                            pdfDocKind === "contrato"
                              ? "bg-white/15 font-medium text-white"
                              : "text-[#BDB7BC] hover:text-white"
                          }`}
                        >
                          Contrato Formalizado
                        </button>
                      </div>
                    )}
                    <a
                      href={pdfInlineUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-white/15 px-3 py-1.5 text-xs text-[#EDE6EC] hover:border-white/35"
                    >
                      Abrir em nova guia
                    </a>
                    <a
                      href={pdfDocKind === "contrato" ? contractDownloadUrl : pdfDownloadUrl}
                      download
                      className="rounded-xl border border-[#E80EFD]/40 bg-[#E80EFD]/10 px-3 py-1.5 text-xs font-medium text-[#EDE6EC] hover:bg-[#E80EFD]/20"
                    >
                      Baixar arquivo
                    </a>
                    <button
                      type="button"
                      onClick={() => setShowPdfViewer(false)}
                      className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-[#BDB7BC] hover:text-white"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
                <div className="bg-black/40">
                  <object
                    data={pdfInlineUrl}
                    type="application/pdf"
                    className="h-[72vh] min-h-[480px] w-full"
                  >
                    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                      <p className="max-w-md text-sm text-[#BDB7BC]">
                        Seu navegador móvel prefere abrir documentos PDF em tela cheia ou fazer o download direto.
                      </p>
                      <div className="flex flex-wrap justify-center gap-3">
                        <a
                          href={pdfInlineUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="kb-btn min-h-11 px-5 text-sm"
                        >
                          Abrir PDF no navegador
                        </a>
                        <a
                          href={pdfDownloadUrl}
                          download
                          className="kb-btn-ghost min-h-11 px-5 text-sm"
                        >
                          Baixar PDF ({s.code})
                        </a>
                      </div>
                    </div>
                  </object>
                </div>
              </section>
            )}

            {/* ── 1. CAPA COMERCIAL (HERO) ─────────────────────────────── */}
            <section className="relative overflow-hidden rounded-3xl border border-white/12 bg-gradient-to-br from-[#1A182E] via-[#131222] to-[#11101E] p-6 shadow-2xl sm:p-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#4F12C7]/25 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#E80EFD]/10 blur-3xl"
              />

              <div className="relative flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 font-mono text-xs font-medium text-[#EDE6EC]">
                    {s.code}
                  </span>
                  <span className="rounded-full border border-[#4F12C7]/50 bg-[#4F12C7]/20 px-3 py-1 text-xs font-medium text-[#EDE6EC]">
                    {serviceCategoryLabel}
                    {subtypeLabel ? ` · ${subtypeLabel}` : ""}
                  </span>
                </div>
                <span
                  className={`rounded-full border px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${
                    data.acceptedAt
                      ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                      : "border-[#E80EFD]/40 bg-[#E80EFD]/12 text-[#EDE6EC]"
                  }`}
                >
                  {data.acceptedAt ? "Proposta Aceita e Formalizada" : "Aguardando Aceite"}
                </span>
              </div>

              <div className="relative mt-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#BDB7BC]">
                  Proposta Comercial & Instrumento de Prestação de Serviços
                </p>
                <h1 className="font-display mt-2 text-3xl font-light tracking-[-0.02em] text-[#EDE6EC] sm:text-5xl sm:leading-[1.08]">
                  {s.title}
                </h1>
              </div>

              {/* Linha em gradiente da identidade LDP */}
              <div className="my-6 h-[2px] w-full bg-gradient-to-r from-[#4F12C7] via-[#E80EFD]/60 to-transparent" />

              <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                    Cliente / Empresa
                  </p>
                  <p className="mt-1.5 text-base font-semibold text-[#EDE6EC]">{s.clientName}</p>
                  {(s.clientCompany || data.companyProfile.companyName) && (
                    <p className="mt-0.5 text-xs text-[#BDB7BC]">
                      {s.clientCompany || data.companyProfile.companyName}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                    Prazo Estimado
                  </p>
                  <p className="mt-1.5 text-base font-semibold text-[#EDE6EC]">{deadlineLabel}</p>
                  <p className="mt-0.5 text-xs text-[#BDB7BC]">
                    Início previsto: {fmtDate(plan.startDate)}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                    Investimento Total
                  </p>
                  <p className="font-display mt-1.5 text-2xl font-light text-[#EDE6EC]">
                    {formatBRL(financialSummary.finalTotal)}
                  </p>
                  <p className="mt-0.5 text-xs text-[#BDB7BC]">
                    {plan.service === "mensal"
                      ? `${plan.months} mensalidade(s) de ${formatBRL(s.total)}`
                      : activeInstallments.length > 1
                        ? `${activeInstallments.length}x no PIX${financialSummary.discountPercent > 0 ? ` (${financialSummary.discountPercent}% OFF · −${formatBRL(financialSummary.discountAmount)})` : " sem juros"}`
                        : `À vista no PIX${financialSummary.discountPercent > 0 ? ` (${financialSummary.discountPercent}% OFF · −${formatBRL(financialSummary.discountAmount)})` : ""}`}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                    Validade da Proposta
                  </p>
                  <p className="mt-1.5 text-base font-semibold text-[#EDE6EC]">
                    {s.validUntil ? fmtDate(s.validUntil) : fmtDate(data.expiresAt)}
                  </p>
                  <p className="mt-0.5 text-xs text-[#BDB7BC]">
                    Link ativo até {fmtDateTime(data.expiresAt)}
                  </p>
                </div>
              </div>
            </section>

            {/* ── FLUXO CONECTADO (ETAPAS DE FORMALIZAÇÃO E CONVERSÃO) ── */}
            <section
              aria-label="Etapas de contratação"
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BDB7BC]">
                  Jornada de Contratação e Ativação
                </p>
                <span className="text-xs text-[#BDB7BC]">
                  Aceite explícito + pagamento confirmado = ativação automática como cliente
                </span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-5">
                {[
                  {
                    step: "01",
                    title: "Proposta apresentada",
                    desc: `Documento ${s.code}`,
                    done: true,
                    active: !data.acceptedAt,
                  },
                  {
                    step: "02",
                    title: "Aceite da proposta",
                    desc: data.acceptedAt ? `Em ${fmtDate(data.acceptedAt)}` : "Assinatura eletrônica",
                    done: Boolean(data.acceptedAt),
                    active: !data.acceptedAt,
                  },
                  {
                    step: "03",
                    title: "Contrato formalizado",
                    desc: data.acceptedAt ? "PDF disponível" : "Instrumento particular",
                    done: Boolean(data.acceptedAt),
                    active: false,
                  },
                  {
                    step: "04",
                    title: "Pagamento e confirmação",
                    desc: data.lifecycle?.paymentConfirmed
                      ? "Pagamento confirmado"
                      : "Entrada / parcela inicial",
                    done: Boolean(data.lifecycle?.paymentConfirmed),
                    active: Boolean(data.acceptedAt && !data.lifecycle?.paymentConfirmed),
                  },
                  {
                    step: "05",
                    title: "Cliente ativo",
                    desc: data.lifecycle?.clientConverted
                      ? "Convertido e ativo"
                      : "Após confirmação do pagamento",
                    done: Boolean(data.lifecycle?.clientConverted),
                    active: false,
                  },
                ].map((st) => (
                  <div
                    key={st.step}
                    className={`rounded-xl border p-3 transition ${
                      st.done
                        ? "border-emerald-400/35 bg-emerald-400/[0.07]"
                        : st.active
                          ? "border-[#E80EFD]/40 bg-[#4F12C7]/15"
                          : "border-white/10 bg-black/20 opacity-75"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest">
                      <span className={st.done ? "text-emerald-300" : "text-[#BDB7BC]"}>
                        Etapa {st.step}
                      </span>
                      <span className={st.done ? "text-emerald-300" : "text-white/40"}>
                        {st.done ? "Concluída" : st.active ? "Atual" : "Pendente"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-[#EDE6EC]">{st.title}</p>
                    <p className="mt-0.5 text-[11px] text-[#BDB7BC]">{st.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── COMPROVANTE DE PROPOSTA ACEITA (QUANDO JÁ ACEITA) ───── */}
            {data.acceptedAt && (
              <section
                role="status"
                aria-label="Registro verificável do aceite"
                className="rounded-3xl border border-emerald-400/35 bg-gradient-to-br from-emerald-500/[0.09] via-[#151A24] to-[#11101E] p-6 sm:p-8"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
                      Cópia da Proposta Aceita · Registro Verificável
                    </p>
                    <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC]">
                      Aceite registrado e contrato formalizado
                    </h2>
                    <p className="mt-1 text-sm text-[#BDB7BC]">
                      O projeto foi aberto em preparação. A conversão definitiva e o início da execução
                      ocorrem mediante a confirmação do pagamento previsto no cronograma.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPdfDocKind("proposta");
                        setShowPdfViewer(true);
                      }}
                      className="rounded-xl border border-white/20 bg-white/[0.06] px-4 py-2.5 text-xs font-semibold text-[#EDE6EC] hover:bg-white/[0.12]"
                    >
                      Visualizar PDF Aceito
                    </button>
                    <a
                      href={pdfDownloadUrl}
                      download
                      className="rounded-xl bg-emerald-500/20 border border-emerald-400/40 px-4 py-2.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30"
                    >
                      Baixar Cópia da Proposta Aceita (PDF)
                    </a>
                    <a
                      href={contractDownloadUrl}
                      download
                      className="rounded-xl border border-white/20 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-[#EDE6EC] hover:border-white/40"
                    >
                      Baixar Contrato Formalizado (PDF)
                    </a>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                      1. Identificação da Proposta
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#EDE6EC]">
                      {s.code} — {s.title}
                    </p>
                    {subtypeLabel && (
                      <p className="mt-0.5 text-xs text-[#BDB7BC]">
                        Categoria: {serviceCategoryLabel} ({subtypeLabel})
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                      2. Data e Horário do Aceite
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#EDE6EC]">
                      {fmtDateTime(data.acceptedAt)}
                    </p>
                    <p className="mt-0.5 text-xs text-[#BDB7BC]">Fuso oficial: America/Belem (BRT)</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                      3. Responsável pelo Aceite
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#EDE6EC]">
                      {data.acceptance?.signerName || data.signerName || data.companyProfile.contactName || s.clientName}
                    </p>
                    <p className="mt-0.5 text-xs text-[#BDB7BC]">
                      {data.companyProfile.legalName || data.companyProfile.companyName || s.clientCompany || s.clientName}
                      {data.companyProfile.document ? ` · ${data.companyProfile.document}` : ""}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                      4. Versão e Condições Aceitas
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#EDE6EC]">
                      {formatBRL(financialSummary.finalTotal)} ({s.installments.length} parcela{s.installments.length > 1 ? "s" : ""})
                    </p>
                    <p className="mt-0.5 text-xs text-[#BDB7BC]">
                      Versão congelada em {fmtDateTime(data.acceptance?.budgetVersion || s.createdAt)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                        5. Registro Verificável do Aceite (Assinatura Eletrônica Simples — Lei nº 14.063/2020)
                      </p>
                      {data.acceptance?.code && (
                        <button
                          type="button"
                          onClick={() => void copyVerificationCode()}
                          className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-[#EDE6EC] hover:border-white/35"
                        >
                          {codeCopied ? "Código copiado" : "Copiar código"}
                        </button>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-sm font-semibold text-emerald-300">
                      {data.acceptance?.code || `KBOS-${s.code.replace("#", "")}-ACEITO`}
                    </p>
                    {data.acceptance?.sha256 && (
                      <p className="mt-1 break-all font-mono text-[11px] text-[#BDB7BC]">
                        SHA-256: {data.acceptance.sha256}
                      </p>
                    )}
                  </div>
                </div>

                {/* Instruções diretas de pagamento por PIX após o aceite */}
                <div className="mt-5 rounded-2xl border border-[#4F12C7]/45 bg-[#4F12C7]/15 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E80EFD]">
                        Próximo Passo · Pagamento Direto via PIX
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#EDE6EC]">
                        {activeInstallments.length > 1
                          ? `1ª parcela no aceite: ${formatBRL(activeInstallments[0]?.amount ?? financialSummary.finalTotal)} (total contratado: ${formatBRL(financialSummary.finalTotal)} em ${activeInstallments.length}x)`
                          : `Pagamento à vista no aceite: ${formatBRL(financialSummary.finalTotal)}`}
                      </p>
                      <p className="mt-1 text-xs text-[#BDB7BC]">
                        Realize o pagamento diretamente pela chave PIX abaixo. Após a conferência bancária e baixa manual pelo estúdio no KBOS, seu cadastro é ativado automaticamente como Cliente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyPix()}
                      className="shrink-0 rounded-xl bg-gradient-to-r from-[#4F12C7] to-[#E80EFD] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#4F12C7]/25 transition hover:opacity-95"
                    >
                      {pixCopied ? "Chave PIX copiada" : "Copiar Chave PIX"}
                    </button>
                  </div>
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/35 p-3 font-mono text-xs text-[#EDE6EC] whitespace-pre-line">
                    {pixInfo}
                  </div>
                </div>

                {data.planningUrl && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[#EDE6EC]">
                        Diretrizes da Marca e Planejamento Estratégico
                      </p>
                      <p className="text-xs text-[#BDB7BC]">
                        Acesse a página dedicada para acompanhar o planejamento e os ativos enviados.
                      </p>
                    </div>
                    <a
                      href={data.planningUrl}
                      className="rounded-xl bg-gradient-to-r from-[#4F12C7] to-[#E80EFD] px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#4F12C7]/25"
                    >
                      Abrir minha marca e planejamento →
                    </a>
                  </div>
                )}
              </section>
            )}

            {/* ── 2 & 3. APRESENTAÇÃO PROFISSIONAL E OBJETIVO DO PROJETO ── */}
            <div className="grid gap-6 md:grid-cols-2">
              <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#BDB7BC]">
                  01 · Apresentação Profissional
                </p>
                <h2 className="font-display mt-2 text-2xl font-light text-[#EDE6EC]">
                  Kayque Brito — Studio Criativo & Engenharia Digital
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[#BDB7BC]">
                  Atuação integrada em desenvolvimento de software sob medida, design de identidade
                  e direção audiovisual em Belém/PA. Cada projeto é construído sobre três pilares
                  inegociáveis: <strong className="text-[#EDE6EC]">Agilidade, Inovação e Inteligência</strong>,
                  unindo estética refinada, performance técnica e foco em resultado comercial.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#BDB7BC]">
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    Arquitetura Web & E-commerce
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    UI/UX & Direção de Arte
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
                    Produção Audiovisual & Conteúdo
                  </span>
                </div>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#BDB7BC]">
                  02 · Objetivo do Projeto
                </p>
                <h2 className="font-display mt-2 text-2xl font-light text-[#EDE6EC]">
                  {subtypeLabel ? `${subtypeLabel} para ${s.clientCompany || s.clientName}` : s.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[#BDB7BC]">
                  Esta proposta estrutura a entrega de{" "}
                  <strong className="text-[#EDE6EC]">{s.title}</strong> para{" "}
                  <strong className="text-[#EDE6EC]">
                    {s.clientCompany ? `${s.clientName} (${s.clientCompany})` : s.clientName}
                  </strong>
                  , com escopo, prazos e responsabilidades claramente delimitados para assegurar
                  previsibilidade de execução, padrão visual superior e retorno comercial.
                </p>
                {s.terms && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3.5 text-xs leading-relaxed text-[#EDE6EC]">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                      Diretrizes Específicas da Proposta
                    </span>
                    <p className="mt-1 whitespace-pre-line">{s.terms}</p>
                  </div>
                )}
              </section>
            </div>

            {/* ── 4. ESCOPO E ENTREGÁVEIS ──────────────────────────────── */}
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#BDB7BC]">
                    03 · Escopo e Entregáveis
                  </p>
                  <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC] sm:text-3xl">
                    Detalhamento dos serviços inclusos
                  </h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1 text-xs text-[#BDB7BC]">
                  {s.items.length} {s.items.length === 1 ? "item detalhado" : "itens detalhados"}
                </span>
              </div>

              <div className="mt-6 space-y-3">
                {s.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-white/20 sm:flex-row sm:items-center sm:p-5"
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#4F12C7]/40 bg-[#4F12C7]/15 font-mono text-xs font-semibold text-[#EDE6EC]">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-[#EDE6EC]">{item.service}</h3>
                        {item.description && (
                          <p className="mt-1 text-sm leading-relaxed text-[#BDB7BC]">
                            {item.description}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#BDB7BC]">
                          <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-0.5">
                            Quantidade: {item.quantity} un.
                          </span>
                          <span className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-0.5">
                            Valor unitário: {formatBRL(item.unitPrice)}
                          </span>
                          {item.date && (
                            <span className="rounded-lg border border-[#E80EFD]/30 bg-[#E80EFD]/10 px-2.5 py-0.5 text-[#EDE6EC]">
                              Execução prevista: {fmtDate(item.date)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right sm:pl-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                        Subtotal
                      </p>
                      <p className="font-display text-xl font-light text-[#EDE6EC]">
                        {formatBRL(item.total)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 5. CRONOGRAMA E PRAZO ESTIMADO ───────────────────────── */}
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#BDB7BC]">
                    04 · Cronograma e Prazo Estimado
                  </p>
                  <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC] sm:text-3xl">
                    Etapas de execução e entrega
                  </h2>
                </div>
                <div className="rounded-2xl border border-[#4F12C7]/40 bg-[#4F12C7]/15 px-4 py-2 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                    Prazo Estimado
                  </p>
                  <p className="text-sm font-semibold text-[#EDE6EC]">{deadlineLabel}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {stages.map((stageTitle, index) => (
                  <div
                    key={stageTitle}
                    className="rounded-2xl border border-white/10 bg-black/25 p-4"
                  >
                    <div className="flex items-center justify-between text-xs text-[#BDB7BC]">
                      <span className="font-mono font-semibold text-[#E80EFD]">
                        FASE 0{index + 1}
                      </span>
                      <span>
                        {index === 0
                          ? `Início: ${fmtDate(plan.startDate)}`
                          : index === stages.length - 1
                            ? `Entrega: ${fmtDate(plan.deliveryDate)}`
                            : "Execução"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[#EDE6EC]">{stageTitle}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-[#BDB7BC]">
                <span>
                  Início programado: <strong className="text-[#EDE6EC]">{fmtDate(plan.startDate)}</strong>
                </span>
                <span>
                  {plan.service === "mensal"
                    ? `Término da vigência (${plan.months} meses): `
                    : "Previsão de conclusão: "}
                  <strong className="text-[#EDE6EC]">{fmtDate(plan.deliveryDate)}</strong>
                </span>
                <span>
                  Os prazos contam a partir do envio dos materiais iniciais e confirmação das condições comerciais.
                </span>
              </div>
            </section>

            {/* ── 6. INVESTIMENTO E CONDIÇÕES DE PAGAMENTO ─────────────── */}
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#BDB7BC]">
                    05 · Investimento e Condições de Pagamento
                  </p>
                  <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC] sm:text-3xl">
                    Demonstrativo transparente de valores e parcelas
                  </h2>
                </div>
                {s.progressiveDiscounts && (
                  <span className="rounded-full border border-[#E80EFD]/40 bg-[#E80EFD]/12 px-3.5 py-1 text-xs font-semibold text-[#EDE6EC]">
                    Descontos progressivos via PIX direto · Até 10% OFF
                  </span>
                )}
              </div>

              {/* Destaque visual da economia da opção à vista (1x com 10% OFF) */}
              {s.progressiveDiscounts && cashOption && cashOption.discountAmount > 0 && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E80EFD]/45 bg-gradient-to-r from-[#4F12C7]/25 via-[#E80EFD]/15 to-transparent p-4 sm:px-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#E80EFD] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                        Maior Economia · 10% OFF à Vista
                      </span>
                      <span className="text-xs font-medium text-[#EDE6EC]">
                        Pagamento via PIX direto com confirmação manual no KBOS
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-[#EDE6EC]">
                      Na opção <strong>À vista (1x)</strong>, você economiza{" "}
                      <strong className="text-[#E80EFD]">{formatBRL(cashOption.discountAmount)}</strong>{" "}
                      sobre o valor base de {formatBRL(cashOption.baseTotal)}, investindo{" "}
                      <strong>{formatBRL(cashOption.total)}</strong>.
                    </p>
                  </div>
                  {!data.acceptedAt && selectedInstallments !== 1 && (
                    <button
                      type="button"
                      onClick={() => setSelectedInstallments(1)}
                      className="shrink-0 rounded-xl border border-[#E80EFD]/50 bg-[#E80EFD]/20 px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#E80EFD]/30"
                    >
                      Selecionar À vista (−{formatBRL(cashOption.discountAmount)})
                    </button>
                  )}
                </div>
              )}

              <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                {/* Quadro resumo de valores: Valor Original, Descontos, Valor Final */}
                <div className="flex flex-col justify-between rounded-2xl border border-white/12 bg-black/30 p-5">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                      Resumo Financeiro da Proposta
                    </p>
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5 text-sm">
                      <span className="text-[#BDB7BC]">Valor base dos serviços</span>
                      <span className="font-medium text-[#EDE6EC]">
                        {formatBRL(financialSummary.subtotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5 text-sm">
                      <span className="text-[#BDB7BC]">
                        {financialSummary.discountPercent > 0
                          ? `Desconto progressivo (${financialSummary.discountPercent}% OFF)`
                          : "Descontos concedidos"}
                      </span>
                      <span
                        className={`font-medium ${
                          financialSummary.discountAmount > 0 ? "text-emerald-300" : "text-[#EDE6EC]"
                        }`}
                      >
                        {financialSummary.discountAmount > 0
                          ? `− ${formatBRL(financialSummary.discountAmount)}`
                          : "R$ 0,00 (0% · valor base)"}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-2">
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#E80EFD]">
                          {plan.service === "mensal" ? "Total do Plano" : "Valor Final Selecionado"}
                        </span>
                        <span className="text-xs text-[#BDB7BC]">
                          {plan.service === "mensal"
                            ? PAY_CONDITION_LABEL[s.paymentCondition || plan.paymentCondition || "cash"]
                            : activeInstallments.length === 1
                              ? `À vista (1x no PIX)${financialSummary.discountPercent > 0 ? ` · ${financialSummary.discountPercent}% de desconto` : ""}`
                              : `Parcelado em ${activeInstallments.length}x no PIX${financialSummary.discountPercent > 0 ? ` · ${financialSummary.discountPercent}% de desconto` : " sem desconto"}`}
                        </span>
                      </div>
                      <span className="font-display text-3xl font-light text-[#EDE6EC]">
                        {formatBRL(financialSummary.finalTotal)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 rounded-xl border border-[#4F12C7]/40 bg-[#4F12C7]/10 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                        Pagamento via PIX Direto (Confirmação Manual)
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyPix()}
                        className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-[#EDE6EC] transition hover:border-white/35"
                      >
                        {pixCopied ? "Copiado" : "Copiar Pix"}
                      </button>
                    </div>
                    <p className="mt-1.5 whitespace-pre-line font-mono text-xs text-[#EDE6EC]">
                      {pixInfo}
                    </p>
                  </div>
                </div>

                {/* Cronograma de parcelas e seletor das 4 opções */}
                <div className="rounded-2xl border border-white/12 bg-black/30 p-5">
                  {plan.service !== "mensal" &&
                    s.interestFreeOptions &&
                    s.interestFreeOptions.length > 1 && (
                      <div className="mb-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                            {data.acceptedAt
                              ? "Modalidade escolhida no aceite"
                              : s.progressiveDiscounts
                                ? "Escolha a opção de pagamento via PIX (1x a 4x)"
                                : "Opções de pagamento (1x a 4x sem juros)"}
                          </span>
                          <span className="text-[11px] text-[#BDB7BC]">
                            {s.progressiveDiscounts
                              ? "Desconto único sobre o valor base (sem acúmulo)"
                              : "Sem juros e sem desconto automático"}
                          </span>
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                          {s.interestFreeOptions.map((opt) => {
                            const active =
                              (data.acceptedAt ? activeInstallments.length : selectedInstallments) ===
                              opt.count;
                            const isCashBest = Boolean(s.progressiveDiscounts && opt.count === 1 && opt.discountPercent > 0);
                            return (
                              <button
                                key={opt.count}
                                type="button"
                                disabled={Boolean(data.acceptedAt)}
                                onClick={() => setSelectedInstallments(opt.count)}
                                aria-pressed={active}
                                className={`relative flex flex-col justify-between rounded-xl border p-3 text-left transition ${
                                  active
                                    ? "border-[#E80EFD] bg-[#E80EFD]/15 text-[#EDE6EC] shadow-lg shadow-[#E80EFD]/10"
                                    : isCashBest
                                      ? "border-[#E80EFD]/40 bg-[#4F12C7]/15 text-[#EDE6EC] hover:border-[#E80EFD]/70"
                                      : "border-white/10 bg-white/[0.02] text-[#BDB7BC] hover:border-white/25"
                                } ${data.acceptedAt ? "cursor-default" : ""}`}
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="text-xs font-bold text-[#EDE6EC]">
                                      {opt.count === 1 ? "À vista (1x)" : `${opt.count}x sem juros`}
                                    </span>
                                    {s.progressiveDiscounts && (
                                      <span
                                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                          opt.discountPercent > 0
                                            ? "bg-[#E80EFD]/25 text-[#EDE6EC]"
                                            : "bg-white/10 text-[#BDB7BC]"
                                        }`}
                                      >
                                        {opt.discountPercent > 0 ? `−${opt.discountPercent}%` : "0%"}
                                      </span>
                                    )}
                                  </div>
                                  <span className="mt-1.5 block text-sm font-semibold text-[#EDE6EC]">
                                    {formatBRL(opt.total)}
                                  </span>
                                  <span className="mt-0.5 block text-[11px] text-[#BDB7BC]">
                                    {opt.count === 1
                                      ? "Parcela única no PIX"
                                      : `${opt.count}x de ${formatBRL(opt.regularAmount)}${opt.firstAmount !== opt.regularAmount ? "*" : ""}`}
                                  </span>
                                </div>
                                {s.progressiveDiscounts && (
                                  <span
                                    className={`mt-2 block border-t border-white/10 pt-1.5 text-[10px] font-semibold ${
                                      opt.discountAmount > 0 ? "text-emerald-300" : "text-[#BDB7BC]"
                                    }`}
                                  >
                                    {opt.discountAmount > 0
                                      ? `Economia de ${formatBRL(opt.discountAmount)}`
                                      : "Valor base integral"}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                      Cronograma de Pagamento ({activeInstallments.length}{" "}
                      {activeInstallments.length === 1 ? "parcela" : "parcelas"} sem juros)
                    </p>
                    <span className="text-xs text-[#BDB7BC]">
                      Soma exata: <strong className="text-[#EDE6EC]">{formatBRL(financialSummary.scheduleTotal)}</strong>
                    </span>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {activeInstallments.map((inst, index) => (
                      <div
                        key={index}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#EDE6EC]">{inst.label}</p>
                          <p className="text-xs text-[#BDB7BC]">
                            {inst.onAcceptance
                              ? `Vencimento no aceite da proposta (${fmtDate(inst.dueDate)})`
                              : `Vencimento programado: ${fmtDate(inst.dueDate)}`}
                          </p>
                        </div>
                        <span className="font-display text-xl font-light text-[#EDE6EC]">
                          {formatBRL(inst.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ── 7 & 8. REVISÕES, CONDIÇÕES COMERCIAIS E VALIDADE ─────── */}
            <section className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#BDB7BC]">
                  06 · Revisões Inclusas
                </p>
                <p className="font-display mt-2 text-2xl font-light text-[#EDE6EC]">
                  {revisionsCount} {revisionsCount === 1 ? "rodada inclusa" : "rodadas inclusas"}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[#BDB7BC]">
                  Contempla até {revisionsCount} rodada(s) de ajustes dentro do escopo aprovado.
                  Alterações estruturais ou demandas fora do escopo inicial são orçadas à parte.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#BDB7BC]">
                  07 · Direitos e Propriedade
                </p>
                <p className="font-display mt-2 text-2xl font-light text-[#EDE6EC]">
                  Cessão de Uso
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[#BDB7BC]">
                  Após a quitação integral dos valores contratados, o CONTRATANTE recebe a titularidade
                  e cessão de uso dos entregáveis finais para as finalidades do projeto.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#BDB7BC]">
                  08 · Validade da Proposta
                </p>
                <p className="font-display mt-2 text-2xl font-light text-[#EDE6EC]">
                  Até {s.validUntil ? fmtDate(s.validUntil) : fmtDate(data.expiresAt)}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-[#BDB7BC]">
                  Condições comerciais, valores e disponibilidade de agenda garantidos até{" "}
                  {fmtDateTime(data.expiresAt)} (horário de Belém/PA).
                </p>
              </div>
            </section>

            {/* ── 9. INSTRUMENTO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS E PDF ── */}
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#BDB7BC]">
                    09 · Instrumento Particular de Prestação de Serviços & PDF
                  </p>
                  <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC] sm:text-3xl">
                    Cláusulas contratuais e versão em PDF
                  </h2>
                  <p className="mt-2 text-sm text-[#BDB7BC]">
                    Contratado: <strong className="text-[#EDE6EC]">Kayque Jonathan Brito</strong> (Belém/PA) ·
                    Contratante:{" "}
                    <strong className="text-[#EDE6EC]">
                      {data.companyProfile.legalName ||
                        data.companyProfile.companyName ||
                        s.clientCompany ||
                        s.clientName}
                    </strong>
                    {data.companyProfile.document ? ` (${data.companyProfile.document})` : ""}.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPdfDocKind("proposta");
                      setShowPdfViewer((v) => !v);
                    }}
                    className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-[#EDE6EC] transition hover:border-white/35"
                  >
                    {showPdfViewer ? "Fechar visualização PDF" : "Visualizar proposta em PDF"}
                  </button>
                  <a
                    href={pdfDownloadUrl}
                    download
                    className="rounded-xl bg-gradient-to-r from-[#4F12C7] to-[#E80EFD] px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[#4F12C7]/20"
                  >
                    {data.acceptedAt ? "Baixar Proposta Aceita (PDF)" : "Baixar PDF (2 páginas)"}
                  </a>
                  {data.acceptedAt && (
                    <a
                      href={contractDownloadUrl}
                      download
                      className="rounded-xl border border-emerald-400/35 bg-emerald-400/10 px-4 py-2.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/20"
                    >
                      Baixar Contrato Formalizado (PDF)
                    </a>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {s.clauses.map((c, idx) => {
                  const isPaymentClause = idx === 4 || c.title.includes("VALOR E PAGAMENTO");
                  const dynamicPaymentBody =
                    isPaymentClause && s.progressiveDiscounts && activeInstallments.length > 0
                      ? `Pagamento via PIX direto (${activeInstallments.length}x sem juros · ${
                          financialSummary.discountPercent > 0
                            ? `${financialSummary.discountPercent}% de desconto progressivo sobre ${formatBRL(financialSummary.subtotal)}, economia de ${formatBRL(financialSummary.discountAmount)}, valor final de ${formatBRL(financialSummary.finalTotal)}`
                            : `valor base de ${formatBRL(financialSummary.subtotal)}, sem desconto`
                        }): ${activeInstallments
                          .map(
                            (i) =>
                              `${i.label}: ${formatBRL(i.amount)}, ${
                                i.onAcceptance ? "na assinatura" : `em ${fmtDate(i.dueDate)}`
                              }`,
                          )
                          .join("; ")}. Tabela de descontos progressivos via PIX: à vista (1x) com 10% de desconto, 2x com 6% de desconto, 3x com 3% de desconto ou 4x sem desconto. Confirmação manual pelo estúdio; atraso superior a 7 dias suspende execução e entregas até a regularização.`
                      : c.body;
                  return (
                    <div
                      key={c.title}
                      className="rounded-2xl border border-white/10 bg-black/25 p-4"
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#EDE6EC]">
                        {c.title}
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-[#BDB7BC]">{dynamicPaymentBody}</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── MATERIAIS DE REFERÊNCIA E MANUAL (SE HOUVER) ─────────── */}
            {(plan.manualUrl || plan.attachments?.length) ? (
              <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#BDB7BC]">
                  Materiais e Referências Anexados
                </p>
                <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC]">
                  Manual de Identidade e arquivos da proposta
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {plan.manualUrl && (
                    <a
                      className="flex items-center justify-between rounded-2xl border border-white/15 bg-black/25 p-4 text-sm font-medium text-[#EDE6EC] hover:border-white/35"
                      href={plan.manualUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Abrir Manual de Identidade</span>
                      <span className="text-xs text-[#BDB7BC]">Link externo →</span>
                    </a>
                  )}
                  {plan.attachments?.map((a, i) => (
                    <a
                      key={i}
                      className="flex items-center justify-between rounded-2xl border border-white/15 bg-black/25 p-4 text-sm font-medium text-[#EDE6EC] hover:border-white/35"
                      href={a.kind === "file" ? `/api/proposals/${token}/files/${a.fileId}/` : a.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="min-w-0 pr-3">
                        <p className="truncate font-semibold">{a.name}</p>
                        <p className="text-xs text-[#BDB7BC]">
                          {a.role === "manual" ? "Manual de Identidade" : "Referência do Projeto"}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-[#E80EFD]">
                        {a.kind === "file" ? "Baixar" : "Abrir"} →
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {/* ── 10. ÁREA DE QUALIFICAÇÃO E ACEITE ELETRÔNICO ─────────── */}
            {!data.acceptedAt && (
              <>
                <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6 sm:p-8">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#BDB7BC]">
                    10 · Qualificação e Diretrizes da Marca (Opcional / Recomendado)
                  </p>
                  <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC]">
                    Dados da empresa e ativos de identidade
                  </h2>
                  <p className="mt-2 mb-6 text-sm text-[#BDB7BC]">
                    Confira os dados cadastrais para o contrato e, se desejar, anexe o logotipo ou
                    manual da sua marca para agilizar o início do planejamento.
                  </p>
                  <CompanyProfileFields
                    value={data.companyProfile}
                    onChange={(companyProfile) =>
                      setData((v) => (v ? { ...v, companyProfile } : v))
                    }
                    uploadUrl={`/api/proposals/${token}/brand-files/`}
                    assetUrl={(id, preview) =>
                      `/api/proposals/${token}/brand-files/${id}/${preview ? "?preview=1" : ""}`
                    }
                    onBusy={setUploading}
                  />
                </section>

                <form
                  onSubmit={accept}
                  className="rounded-3xl border border-[#4F12C7]/45 bg-gradient-to-br from-[#1C1738] via-[#141326] to-[#11101E] p-6 shadow-2xl sm:p-8"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#E80EFD]">
                      Formalização e Aceite Comercial
                    </p>
                    <span className="text-xs text-[#BDB7BC]">
                      Assinatura eletrônica simples (Lei nº 14.063/2020)
                    </span>
                  </div>
                  <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC] sm:text-3xl">
                    Confirmar aceite da proposta {s.code}
                  </h2>
                  <p className="mt-2 text-sm text-[#BDB7BC]">
                    Ao confirmar o aceite abaixo, você aprova o escopo, o cronograma e as cláusulas
                    do Instrumento Particular de Prestação de Serviços no valor total de{" "}
                    <strong className="text-[#EDE6EC]">{formatBRL(financialSummary.finalTotal)}</strong>.
                  </p>

                  <div className="mt-6 space-y-4">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-[#BDB7BC]">
                        Nome completo do responsável pelo aceite *
                      </span>
                      <input
                        className="kb-control min-h-12 w-full rounded-xl border border-white/15 bg-black/40 px-4 text-base text-[#EDE6EC] outline-none focus:border-[#E80EFD]"
                        autoComplete="name"
                        placeholder="Ex.: Luana Nakata"
                        required
                        minLength={3}
                        maxLength={160}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-[#EDE6EC] transition hover:border-white/25">
                      <input
                        type="checkbox"
                        required
                        checked={contract}
                        onChange={(e) => setContract(e.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#E80EFD]"
                      />
                      <span>
                        Li e aceito integralmente o resumo comercial ({s.code}), o cronograma de
                        pagamento ({formatBRL(financialSummary.finalTotal)}) e todas as cláusulas do
                        Instrumento Particular de Prestação de Serviços.
                      </span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-[#EDE6EC] transition hover:border-white/25">
                      <input
                        type="checkbox"
                        required
                        checked={manual}
                        onChange={(e) => setManual(e.target.checked)}
                        className="mt-1 h-4 w-4 shrink-0 accent-[#E80EFD]"
                      />
                      <span>
                        {plan.manualUrl || plan.attachments?.length
                          ? "Revisei os dados da minha empresa e aprovo o Manual de Identidade e os materiais de referência vinculados a esta proposta."
                          : "Revisei os dados da minha empresa e comprometo-me a fornecer os materiais e aprovações necessários conforme previsto no contrato."}
                      </span>
                    </label>

                    <button
                      type="submit"
                      className="min-h-13 w-full rounded-2xl bg-gradient-to-r from-[#4F12C7] to-[#E80EFD] px-6 py-3.5 text-base font-semibold text-white shadow-xl shadow-[#4F12C7]/30 transition hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        busy ||
                        uploading ||
                        !contract ||
                        !manual ||
                        name.trim().length < 3 ||
                        !data.companyProfile.companyName.trim()
                      }
                    >
                      {uploading
                        ? "Enviando arquivos da marca…"
                        : busy
                          ? "Registrando aceite e gerando comprovante…"
                          : `Aceitar e formalizar proposta (${formatBRL(financialSummary.finalTotal)})`}
                    </button>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-[#BDB7BC]">
                      <span>
                        Link válido até {fmtDateTime(data.expiresAt)} (America/Belem).
                      </span>
                      <span>
                        Após o aceite, uma cópia formalizada em PDF com código verificável ficará
                        disponível imediatamente nesta página.
                      </span>
                    </div>
                  </div>
                </form>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
