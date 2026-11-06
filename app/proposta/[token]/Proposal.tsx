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

// Superfície de vidro incolor translúcido com leve desfoque e borda especular sutil.
const GLASS_PANEL =
  "relative overflow-hidden rounded-3xl border border-white/[0.09] bg-white/[0.03] backdrop-blur-2xl backdrop-saturate-150 shadow-[0_24px_64px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.12)]";

const GLASS_SUBCARD =
  "rounded-2xl border border-white/[0.08] bg-white/[0.025] backdrop-blur-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)]";

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
  const [showClauses, setShowClauses] = useState(false);
  const [showBrandFields, setShowBrandFields] = useState(false);
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
  const deadlineLabel = s?.deliveryDeadline || plan?.deliveryDeadline || "30 dias";
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
    <div className="kbos relative min-h-screen overflow-x-hidden bg-[#0D0C16] text-[#EDE6EC] selection:bg-[#4F12C7]/40 selection:text-white">
      {/* Animacoes fluidas de fundo roxo + ruido sutil de vidro */}
      <style>{`
        @keyframes kbOrbFloatA {
          0% { transform: translate3d(-4%, -3%, 0) scale(1); }
          50% { transform: translate3d(8%, 6%, 0) scale(1.12); }
          100% { transform: translate3d(-2%, 10%, 0) scale(0.96); }
        }
        @keyframes kbOrbFloatB {
          0% { transform: translate3d(6%, 4%, 0) scale(1.04); }
          50% { transform: translate3d(-9%, -6%, 0) scale(0.92); }
          100% { transform: translate3d(4%, -8%, 0) scale(1.1); }
        }
        @keyframes kbOrbFloatC {
          0% { transform: translate3d(0%, 6%, 0) scale(0.95); }
          50% { transform: translate3d(7%, -5%, 0) scale(1.08); }
          100% { transform: translate3d(-6%, 2%, 0) scale(1); }
        }
        .kb-orb-a { animation: kbOrbFloatA 22s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate; will-change: transform; }
        .kb-orb-b { animation: kbOrbFloatB 28s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate; will-change: transform; }
        .kb-orb-c { animation: kbOrbFloatC 25s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite alternate; will-change: transform; }
        @media (prefers-reduced-motion: reduce) {
          .kb-orb-a, .kb-orb-b, .kb-orb-c { animation: none !important; }
        }
      `}</style>

      {/* CAMADA DE FUNDO: Degrade roxo em movimento continuo + textura de ruido optico */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="kb-orb-a absolute -top-32 -left-24 h-[34rem] w-[34rem] rounded-full bg-[#4F12C7]/35 blur-[130px]" />
        <div className="kb-orb-b absolute top-[28%] -right-28 h-[38rem] w-[38rem] rounded-full bg-[#350C85]/45 blur-[140px]" />
        <div className="kb-orb-c absolute -bottom-36 left-[18%] h-[32rem] w-[32rem] rounded-full bg-[#4F12C7]/28 blur-[135px]" />
        {/* Ponto focal de 5% em magenta apenas na atmosfera profunda */}
        <div className="kb-orb-a absolute top-[62%] right-[22%] h-64 w-64 rounded-full bg-[#E80EFD]/[0.07] blur-[110px]" />
        {/* Ruido granulado sutil para efeito de vidro fosco real */}
        <div
          className="absolute inset-0 opacity-[0.04] mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* BARRA SUPERIOR EM VIDRO INCOLOR */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-white/[0.02] backdrop-blur-2xl backdrop-saturate-150">
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
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-[#EDE6EC] transition duration-200 hover:border-white/25 hover:bg-white/[0.08] active:scale-[0.97]"
              >
                {showPdfViewer ? "Ocultar PDF" : "Visualizar PDF"}
              </button>
              <a
                href={pdfDownloadUrl}
                download
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-[#4F12C7]/85 px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_24px_rgba(79,18,199,0.35),inset_0_1px_0_0_rgba(255,255,255,0.2)] transition duration-200 hover:bg-[#5B18DE] active:scale-[0.97]"
              >
                {data?.acceptedAt ? "Baixar Proposta Aceita (PDF)" : "Baixar PDF (2 páginas)"}
              </a>
            </div>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-10">
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-200 backdrop-blur-xl"
          >
            <p className="font-semibold">Atenção</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {loading && !s && !error && (
          <div className={`${GLASS_PANEL} space-y-4 p-8`}>
            <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-white/10" />
            <div className="h-24 w-full animate-pulse rounded-2xl bg-white/5" />
            <p className="text-sm text-[#BDB7BC]">Carregando proposta comercial…</p>
          </div>
        )}

        {s && data && plan && (
          <>
            {/* VISUALIZADOR DE PDF SOB DEMANDA */}
            {showPdfViewer && (
              <section aria-label="Visualizador de PDF integrado" className={GLASS_PANEL}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#BDB7BC]">
                      Documento Oficial · 2 Páginas (A4)
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
                      className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-[#EDE6EC] hover:bg-white/[0.12]"
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
                <div className="bg-black/30">
                  <object
                    data={pdfInlineUrl}
                    type="application/pdf"
                    className="h-[72vh] min-h-[480px] w-full"
                  >
                    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
                      <p className="max-w-md text-sm text-[#BDB7BC]">
                        Seu navegador prefere abrir documentos PDF em tela cheia ou fazer o download direto.
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

            {/* ── 1. CAPA COMERCIAL (VIDRO INCOLOR + HIERARQUIA LIMPA) ───── */}
            <section className={`${GLASS_PANEL} p-6 sm:p-9`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 font-mono text-xs font-medium text-[#EDE6EC]">
                    {s.code}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-[#BDB7BC]">
                    {serviceCategoryLabel}
                    {subtypeLabel ? ` · ${subtypeLabel}` : ""}
                  </span>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1 text-xs font-medium text-[#EDE6EC]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      data.acceptedAt ? "bg-emerald-400" : "bg-[#E80EFD]"
                    }`}
                  />
                  {data.acceptedAt ? "Proposta Aceita e Formalizada" : "Aguardando Aceite"}
                </span>
              </div>

              <div className="mt-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BDB7BC]">
                  Proposta Comercial · Studio Kayque Brito
                </p>
                <h1 className="font-display mt-1.5 text-3xl font-light tracking-[-0.02em] text-[#EDE6EC] sm:text-5xl sm:leading-[1.08]">
                  {s.title}
                </h1>
                {s.terms && (
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#BDB7BC]">
                    {s.terms}
                  </p>
                )}
              </div>

              {/* 4 Indicadores Essenciais (sem repetição ao longo da página) */}
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className={`${GLASS_SUBCARD} p-4`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                    Cliente
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#EDE6EC]">{s.clientName}</p>
                  <p className="mt-0.5 text-xs text-[#BDB7BC]">
                    {s.clientCompany || data.companyProfile.companyName || "Contratante"}
                  </p>
                </div>

                <div className={`${GLASS_SUBCARD} p-4`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                    Prazo de Entrega
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#EDE6EC]">{deadlineLabel}</p>
                  <p className="mt-0.5 text-xs text-[#BDB7BC]">
                    Previsão: {fmtDate(plan.startDate)} a {fmtDate(plan.deliveryDate)}
                  </p>
                </div>

                <div className={`${GLASS_SUBCARD} p-4`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                    Validade do Orçamento
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#EDE6EC]">
                    10 dias ({s.validUntil ? `até ${fmtDate(s.validUntil)}` : `até ${fmtDate(data.expiresAt)}`})
                  </p>
                  <p className="mt-0.5 text-xs text-[#BDB7BC]">
                    Expira em {fmtDateTime(data.expiresAt)}
                  </p>
                </div>

                <div className={`${GLASS_SUBCARD} p-4`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                    Investimento Selecionado
                  </p>
                  <p className="font-display mt-1 text-2xl font-light text-[#EDE6EC]">
                    {formatBRL(financialSummary.finalTotal)}
                  </p>
                  <p className="mt-0.5 text-xs text-[#BDB7BC]">
                    {activeInstallments.length === 1
                      ? `À vista no PIX${financialSummary.discountPercent > 0 ? ` (${financialSummary.discountPercent}% OFF)` : ""}`
                      : `${activeInstallments.length}x no PIX${financialSummary.discountPercent > 0 ? ` (${financialSummary.discountPercent}% OFF)` : " sem juros"}`}
                  </p>
                </div>
              </div>
            </section>

            {/* ── COMPROVANTE DE ACEITE (EXIBIDO APENAS QUANDO JÁ ACEITA) ── */}
            {data.acceptedAt && (
              <section
                role="status"
                aria-label="Registro verificável do aceite"
                className={`${GLASS_PANEL} border-emerald-400/30 p-6 sm:p-8`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
                      Proposta Aceita · Registro Verificável
                    </p>
                    <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC]">
                      Aceite registrado e contrato formalizado
                    </h2>
                    <p className="mt-1 text-sm text-[#BDB7BC]">
                      Data do aceite: {fmtDateTime(data.acceptedAt)} · Responsável:{" "}
                      <strong className="text-[#EDE6EC]">
                        {data.acceptance?.signerName || data.signerName || s.clientName}
                      </strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={pdfDownloadUrl}
                      download
                      className="rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
                    >
                      Baixar Proposta Aceita (PDF)
                    </a>
                    <a
                      href={contractDownloadUrl}
                      download
                      className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-[#EDE6EC] hover:border-white/30"
                    >
                      Baixar Contrato (PDF)
                    </a>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className={`${GLASS_SUBCARD} p-4`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                        Código de Verificação (Lei nº 14.063/2020)
                      </span>
                      {data.acceptance?.code && (
                        <button
                          type="button"
                          onClick={() => void copyVerificationCode()}
                          className="rounded-lg border border-white/15 px-2 py-0.5 text-[11px] text-[#EDE6EC] hover:border-white/35"
                        >
                          {codeCopied ? "Copiado" : "Copiar"}
                        </button>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs font-semibold text-emerald-300">
                      {data.acceptance?.code || `KBOS-${s.code.replace("#", "")}-ACEITO`}
                    </p>
                    {data.acceptance?.sha256 && (
                      <p className="mt-1 truncate font-mono text-[10px] text-[#BDB7BC]">
                        SHA-256: {data.acceptance.sha256}
                      </p>
                    )}
                  </div>

                  <div className={`${GLASS_SUBCARD} p-4`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                        Pagamento via PIX Direto
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyPix()}
                        className="rounded-lg border border-white/15 px-2 py-0.5 text-[11px] text-[#EDE6EC] hover:border-white/35"
                      >
                        {pixCopied ? "Chave copiada" : "Copiar PIX"}
                      </button>
                    </div>
                    <p className="mt-1 font-mono text-xs text-[#EDE6EC]">{pixInfo}</p>
                    <p className="mt-1 text-[11px] text-[#BDB7BC]">
                      1ª parcela no aceite: {formatBRL(activeInstallments[0]?.amount ?? financialSummary.finalTotal)}. Ativação como cliente após confirmação bancária.
                    </p>
                  </div>
                </div>

                {data.planningUrl && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[#EDE6EC]">
                        Diretrizes da Marca e Planejamento
                      </p>
                      <p className="text-xs text-[#BDB7BC]">
                        Acompanhe o planejamento estratégico e os ativos enviados.
                      </p>
                    </div>
                    <a
                      href={data.planningUrl}
                      className="rounded-xl border border-white/15 bg-[#4F12C7]/85 px-4 py-2 text-xs font-semibold text-white hover:bg-[#5B18DE]"
                    >
                      Abrir planejamento →
                    </a>
                  </div>
                )}
              </section>
            )}

            {/* ── 2. ESCOPO, ENTREGÁVEIS E CRONOGRAMA DE 30 DIAS ───────── */}
            <section className={`${GLASS_PANEL} p-6 sm:p-8`}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BDB7BC]">
                    01 · Escopo e Execução
                  </p>
                  <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC] sm:text-3xl">
                    Entregáveis e fases do projeto
                  </h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1 text-xs text-[#BDB7BC]">
                  Prazo total de entrega: <strong className="text-[#EDE6EC]">{deadlineLabel}</strong>
                </span>
              </div>

              {/* Lista enxuta de entregáveis */}
              <div className="mt-5 space-y-3">
                {s.items.map((item, idx) => (
                  <div
                    key={idx}
                    className={`${GLASS_SUBCARD} flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center`}
                  >
                    <div className="flex items-start gap-3.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.04] font-mono text-xs font-semibold text-[#EDE6EC]">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-[#EDE6EC]">{item.service}</h3>
                        {item.description && (
                          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#BDB7BC]">
                            {item.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right sm:pl-4">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                        Valor Base
                      </span>
                      <p className="font-display text-xl font-light text-[#EDE6EC]">
                        {formatBRL(item.total)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Linha do tempo das 4 etapas */}
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {stages.map((stageTitle, index) => (
                  <div key={stageTitle} className={`${GLASS_SUBCARD} p-4`}>
                    <div className="flex items-center justify-between text-[11px] text-[#BDB7BC]">
                      <span className="font-mono font-semibold text-[#EDE6EC]">
                        ETAPA 0{index + 1}
                      </span>
                      <span>
                        {index === 0
                          ? fmtDate(plan.startDate)
                          : index === stages.length - 1
                            ? fmtDate(plan.deliveryDate)
                            : "Execução"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-[#EDE6EC]">{stageTitle}</p>
                  </div>
                ))}
              </div>

              {/* Garantias operacionais integradas (sem criar seções repetidas) */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs text-[#BDB7BC]">
                <span>
                  Revisões inclusas: <strong className="text-[#EDE6EC]">até {revisionsCount} rodadas</strong> dentro do escopo
                </span>
                <span>
                  Titularidade: <strong className="text-[#EDE6EC]">cessão integral de uso</strong> após quitação
                </span>
                <span>
                  Suporte direto: <strong className="text-[#EDE6EC]">Studio Kayque Brito (Belém/PA)</strong>
                </span>
              </div>
            </section>

            {/* ── 3. FORMAS DE PAGAMENTO E DESCONTOS PROGRESSIVOS PIX ──── */}
            <section className={`${GLASS_PANEL} p-6 sm:p-8`}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BDB7BC]">
                    02 · Investimento e Formas de Pagamento
                  </p>
                  <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC] sm:text-3xl">
                    { data.acceptedAt
                      ? "Condição de pagamento formalizada"
                      : "Selecione a forma de pagamento via PIX" }
                  </h2>
                </div>
                <span className="text-xs text-[#BDB7BC]">
                  Valor base: <strong className="text-[#EDE6EC]">{formatBRL(financialSummary.subtotal)}</strong> · Sem juros em até 4x
                </span>
              </div>

              {/* SELETOR ESTRUTURADO DAS 4 OPÇÕES (1x, 2x, 3x, 4x) */}
              {plan.service !== "mensal" &&
                s.interestFreeOptions &&
                s.interestFreeOptions.length > 1 && (
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {s.interestFreeOptions.map((opt) => {
                      const active =
                        (data.acceptedAt ? activeInstallments.length : selectedInstallments) ===
                        opt.count;
                      const isCash = opt.count === 1;
                      return (
                        <button
                          key={opt.count}
                          type="button"
                          disabled={Boolean(data.acceptedAt)}
                          onClick={() => setSelectedInstallments(opt.count)}
                          aria-pressed={active}
                          className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition duration-200 active:scale-[0.98] ${
                            active
                              ? "border-white/30 bg-white/[0.08] shadow-[0_12px_32px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.22)]"
                              : "border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                          } ${data.acceptedAt ? "cursor-default" : ""}`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#EDE6EC]">
                                <span
                                  className={`h-2 w-2 rounded-full transition ${
                                    active
                                      ? "bg-[#E80EFD] shadow-[0_0_8px_#E80EFD]"
                                      : "border border-white/30 bg-transparent"
                                  }`}
                                />
                                {isCash ? "À vista (1x)" : `${opt.count}x sem juros`}
                              </span>
                              {s.progressiveDiscounts && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
                                    isCash
                                      ? "border border-[#E80EFD]/40 bg-[#E80EFD]/12 text-[#EDE6EC]"
                                      : opt.discountPercent > 0
                                        ? "border border-white/15 bg-white/[0.06] text-[#EDE6EC]"
                                        : "border border-white/10 bg-white/[0.02] text-[#BDB7BC]"
                                  }`}
                                >
                                  {opt.discountPercent > 0 ? `−${opt.discountPercent}%` : "Base"}
                                </span>
                              )}
                            </div>

                            <div className="mt-4">
                              <p className="font-display text-2xl font-light text-[#EDE6EC]">
                                {isCash
                                  ? formatBRL(opt.total)
                                  : `${opt.count}x de ${formatBRL(opt.regularAmount)}`}
                              </p>
                              <p className="mt-0.5 text-xs text-[#BDB7BC]">
                                {isCash
                                  ? "Parcela única no aceite"
                                  : `Total: ${formatBRL(opt.total)}${
                                      opt.firstAmount !== opt.regularAmount
                                        ? ` (1ª de ${formatBRL(opt.firstAmount)})`
                                        : ""
                                    }`}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 border-t border-white/[0.08] pt-2.5 text-[11px]">
                            {opt.discountAmount > 0 ? (
                              <span className="font-medium text-emerald-300">
                                Economia de {formatBRL(opt.discountAmount)}
                              </span>
                            ) : (
                              <span className="text-[#BDB7BC]">Valor base sem desconto</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

              {/* DETALHAMENTO DE VENCIMENTOS + CHAVE PIX (LADO A LADO, SEM REPETIÇÃO) */}
              <div className="mt-6 grid gap-4 lg:grid-cols-12">
                {/* Coluna Esquerda: Vencimentos da opção selecionada */}
                <div className={`${GLASS_SUBCARD} flex flex-col justify-between p-5 lg:col-span-7`}>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                        Cronograma da Opção Selecionada ({activeInstallments.length}x)
                      </span>
                      <span className="text-xs text-[#BDB7BC]">
                        {financialSummary.discountAmount > 0
                          ? `Desconto de ${financialSummary.discountPercent}% (−${formatBRL(financialSummary.discountAmount)})`
                          : "Sem desconto (0%)"}
                      </span>
                    </div>

                    <div className="mt-3 divide-y divide-white/[0.06]">
                      {activeInstallments.map((inst, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between gap-3 py-2.5 text-sm"
                        >
                          <div>
                            <p className="font-medium text-[#EDE6EC]">{inst.label}</p>
                            <p className="text-xs text-[#BDB7BC]">
                              {inst.onAcceptance
                                ? `No aceite da proposta (${fmtDate(inst.dueDate)})`
                                : `Vencimento em ${fmtDate(inst.dueDate)}`}
                            </p>
                          </div>
                          <span className="font-mono text-sm font-semibold text-[#EDE6EC]">
                            {formatBRL(inst.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 flex items-baseline justify-between border-t border-white/10 pt-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                      Total Final ({activeInstallments.length}x no PIX)
                    </span>
                    <span className="font-display text-2xl font-light text-[#EDE6EC]">
                      {formatBRL(financialSummary.finalTotal)}
                    </span>
                  </div>
                </div>

                {/* Coluna Direita: Chave PIX e fluxo de confirmação */}
                <div className={`${GLASS_SUBCARD} flex flex-col justify-between p-5 lg:col-span-5`}>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#BDB7BC]">
                        Chave PIX Oficial
                      </span>
                      <button
                        type="button"
                        onClick={() => void copyPix()}
                        className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-[#EDE6EC] transition hover:border-white/30 hover:bg-white/[0.12] active:scale-[0.97]"
                      >
                        {pixCopied ? "Chave copiada" : "Copiar Chave PIX"}
                      </button>
                    </div>

                    <div className="mt-3 rounded-xl border border-white/[0.08] bg-black/25 p-3.5 font-mono text-xs text-[#EDE6EC] whitespace-pre-line">
                      {pixInfo}
                    </div>
                  </div>

                  <p className="mt-4 text-xs leading-relaxed text-[#BDB7BC]">
                    Pagamento direto via PIX após o aceite eletrônico. A ativação automática como{" "}
                    <strong className="text-[#EDE6EC]">Cliente</strong> e o início do cronograma ocorrem
                    assim que o recebimento da 1ª parcela é confirmado pelo estúdio.
                  </p>
                </div>
              </div>
            </section>

            {/* ── 4. TERMOS CONTRATUAIS E PDF (COLAPSÁVEL PARA LEITURA LIMPA) ── */}
            <section className={`${GLASS_PANEL} p-6 sm:p-8`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BDB7BC]">
                    03 · Instrumento Particular de Prestação de Serviços
                  </p>
                  <h2 className="font-display mt-1 text-xl font-light text-[#EDE6EC] sm:text-2xl">
                    Cláusulas de salvaguarda e versão em PDF (2 páginas)
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShowClauses((v) => !v)}
                    className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-medium text-[#EDE6EC] transition hover:border-white/25 hover:bg-white/[0.08] active:scale-[0.97]"
                  >
                    {showClauses ? "Ocultar cláusulas" : `Ler as ${s.clauses.length} cláusulas`}
                  </button>
                  <a
                    href={pdfDownloadUrl}
                    download
                    className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-[#EDE6EC] transition hover:bg-white/[0.12] active:scale-[0.97]"
                  >
                    Baixar PDF Completo
                  </a>
                </div>
              </div>

              {showClauses && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
                            .join("; ")}. Confirmação manual pelo estúdio; atraso superior a 7 dias suspende execução e entregas até a regularização.`
                        : c.body;
                    return (
                      <div key={c.title} className={`${GLASS_SUBCARD} p-4`}>
                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#EDE6EC]">
                          {c.title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-[#BDB7BC]">
                          {dynamicPaymentBody}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── MATERIAIS ANEXADOS (SE HOUVER) ───────────────────────── */}
            {(plan.manualUrl || plan.attachments?.length) ? (
              <section className={`${GLASS_PANEL} p-6 sm:p-8`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BDB7BC]">
                  Materiais e Referências
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {plan.manualUrl && (
                    <a
                      className={`${GLASS_SUBCARD} flex items-center justify-between p-4 text-sm font-medium text-[#EDE6EC] hover:border-white/25`}
                      href={plan.manualUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Abrir Manual de Identidade</span>
                      <span className="text-xs text-[#BDB7BC]">Abrir →</span>
                    </a>
                  )}
                  {plan.attachments?.map((a, i) => (
                    <a
                      key={i}
                      className={`${GLASS_SUBCARD} flex items-center justify-between p-4 text-sm font-medium text-[#EDE6EC] hover:border-white/25`}
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
                      <span className="shrink-0 text-xs text-[#EDE6EC]">
                        {a.kind === "file" ? "Baixar" : "Abrir"} →
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {/* ── 5. FORMALIZAÇÃO E ACEITE ELETRÔNICO ──────────────────── */}
            {!data.acceptedAt && (
              <form onSubmit={accept} className={`${GLASS_PANEL} p-6 sm:p-8`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BDB7BC]">
                      04 · Formalização e Aceite Eletrônico
                    </p>
                    <h2 className="font-display mt-1 text-2xl font-light text-[#EDE6EC] sm:text-3xl">
                      Confirmar aceite da proposta {s.code}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowBrandFields((v) => !v)}
                    className="rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-[#EDE6EC] transition hover:border-white/25 hover:bg-white/[0.08]"
                  >
                    {showBrandFields
                      ? "Ocultar dados da marca"
                      : "Editar dados da empresa / anexar marca (opcional)"}
                  </button>
                </div>

                {showBrandFields && (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-5">
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
                  </div>
                )}

                <div className="mt-6 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.16em] text-[#BDB7BC]">
                      Nome completo do responsável pelo aceite *
                    </span>
                    <input
                      className="kb-control min-h-12 w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 text-base text-[#EDE6EC] outline-none transition focus:border-white/40"
                      autoComplete="name"
                      placeholder="Ex.: Luana Nakata"
                      required
                      minLength={3}
                      maxLength={160}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>

                  <label className={`${GLASS_SUBCARD} flex cursor-pointer items-start gap-3 p-4 text-sm text-[#EDE6EC] transition hover:border-white/20`}>
                    <input
                      type="checkbox"
                      required
                      checked={contract}
                      onChange={(e) => setContract(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[#4F12C7]"
                    />
                    <span>
                      Li e aceito o escopo ({s.code}), o prazo de entrega de{" "}
                      <strong>{deadlineLabel}</strong>, a condição de pagamento selecionada (
                      <strong>
                        {activeInstallments.length}x no PIX · Total {formatBRL(financialSummary.finalTotal)}
                      </strong>
                      ) e as cláusulas do Instrumento Particular de Prestação de Serviços.
                    </span>
                  </label>

                  <label className={`${GLASS_SUBCARD} flex cursor-pointer items-start gap-3 p-4 text-sm text-[#EDE6EC] transition hover:border-white/20`}>
                    <input
                      type="checkbox"
                      required
                      checked={manual}
                      onChange={(e) => setManual(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[#4F12C7]"
                    />
                    <span>
                      {plan.manualUrl || plan.attachments?.length
                        ? "Confirmo os dados da empresa e aprovo os materiais de referência vinculados a esta proposta."
                        : "Confirmo os dados da empresa e comprometo-me a fornecer os materiais e aprovações necessários para a execução."}
                    </span>
                  </label>

                  <button
                    type="submit"
                    className="min-h-13 w-full rounded-2xl border border-white/15 bg-[#4F12C7] px-6 py-3.5 text-base font-semibold text-white shadow-[0_12px_36px_rgba(79,18,199,0.4),inset_0_1px_0_0_rgba(255,255,255,0.22)] transition duration-200 hover:bg-[#5B18DE] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
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
                        : `Aceitar proposta (${activeInstallments.length}x no PIX · ${formatBRL(financialSummary.finalTotal)})`}
                  </button>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-[#BDB7BC]">
                    <span>
                      Assinatura eletrônica simples (Lei nº 14.063/2020) · Validade de 10 dias (até {fmtDate(data.expiresAt)}).
                    </span>
                    <span>
                      Cópia formalizada em PDF liberada imediatamente após o aceite.
                    </span>
                  </div>
                </div>
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
