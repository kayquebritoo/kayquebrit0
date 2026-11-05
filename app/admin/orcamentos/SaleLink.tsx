"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildInterestFreeOptions,
  calcProviderFeeBreakdown,
  inferServiceAndSubtype,
  localDay,
  paymentSchedule,
  planEndDate,
  PROJECT_SUBTYPES,
  SERVICE_LABELS,
  type SaleMaterial,
  type SaleService,
} from "@/lib/kbos/sale-plan";
import {
  calcDiscountAmount,
  formatBRL,
  PAYMENT_CONDITIONS,
  type DiscountType,
  type PaymentCondition,
} from "@/lib/kbos/budget-calc";
import SaleMaterials from "./SaleMaterials";

export type SaleLinkBudgetSource = {
  id: string;
  code?: string;
  title?: string;
  contactId: string | null;
  totalAmount?: string | number;
  items?: { service?: string; description?: string | null; quantity?: number; unitPrice?: number; date?: string | null }[];
  terms?: string | null;
  eventDates?: string[] | null;
  discountType?: string | null;
  discountValue?: string | number | null;
  paymentCondition?: string | null;
  deliveryDeadline?: string | null;
};

const parseNum = (v: unknown): number => {
  if (typeof v === "string") v = v.replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export default function SaleLink({
  budgetId,
  contactId,
  monthly = false,
  amount = 0,
  initialStart,
  budget,
  onClose,
  onCreated,
}: {
  budgetId: string;
  contactId: string | null;
  monthly?: boolean;
  amount?: number;
  initialStart?: string;
  budget?: SaleLinkBudgetSource | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const inferred = useMemo(
    () =>
      budget
        ? inferServiceAndSubtype({
            title: budget.title,
            terms: budget.terms,
            items: budget.items,
            dates: budget.eventDates,
          })
        : { service: (monthly ? "mensal" : "branding") as SaleService, subtype: "" },
    [budget, monthly],
  );

  const [service, setService] = useState<SaleService>(inferred.service);
  const [subtype, setSubtype] = useState<string>(
    inferred.subtype || PROJECT_SUBTYPES[inferred.service]?.[0] || "",
  );
  const [startDate, setStart] = useState(initialStart || localDay());
  const [deliveryDate, setDelivery] = useState(() => {
    const base = initialStart || localDay();
    const [y, m, d] = base.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + 15)).toISOString().slice(0, 10);
  });
  const [months, setMonths] = useState(1);
  const [paymentCondition, setPaymentCondition] = useState<PaymentCondition>(
    budget?.paymentCondition === "installments" || budget?.paymentCondition === "card"
      ? budget.paymentCondition
      : "cash",
  );
  const [installmentsCount, setInstallmentsCount] = useState<number>(
    budget?.paymentCondition === "installments" ? 2 : 1,
  );
  const [maxInstallments, setMaxInstallments] = useState<number>(4);
  const [progressiveDiscounts, setProgressiveDiscounts] = useState<boolean>(!monthly);
  const [applyCashDiscount, setApplyCashDiscount] = useState<boolean>(false);
  const [sellerFeeInput, setSellerFeeInput] = useState<string>("");
  const [existingStatus, setExistingStatus] = useState<{
    exists: boolean;
    accepted: boolean;
    versionNumber: number;
  } | null>(null);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [discountType, setDiscountType] = useState<DiscountType>(
    budget?.discountType === "percent" ? "percent" : "fixed",
  );
  const [discountValue, setDiscountValue] = useState<string>(() => {
    const dv = parseNum(budget?.discountValue);
    return dv > 0 ? String(dv).replace(".", ",") : "";
  });
  const [deliveryDeadline, setDeliveryDeadline] = useState<string>(budget?.deliveryDeadline || "");
  const [attachments, setAttachments] = useState<SaleMaterial[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<{ id: string; title: string; contactId: string; stage: string }[]>([]);
  const [dealId, setDealId] = useState("");
  const dialog = useRef<HTMLElement>(null);

  const endDate = service === "mensal" ? planEndDate(startDate, months) : deliveryDate;

  const subtotal = useMemo(() => {
    if (budget?.items && budget.items.length > 0) {
      const sum = budget.items.reduce(
        (acc, it) => acc + (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0),
        0,
      );
      if (sum > 0) return Math.round(sum * 100) / 100;
    }
    return Math.round(Number(amount || budget?.totalAmount || 0) * 100) / 100;
  }, [budget, amount]);

  const budgetDiscountAmount = useMemo(
    () =>
      progressiveDiscounts
        ? 0
        : calcDiscountAmount(subtotal, discountType, parseNum(discountValue)),
    [progressiveDiscounts, subtotal, discountType, discountValue],
  );

  const baseTotal = useMemo(
    () => Math.max(0, Math.round((subtotal - budgetDiscountAmount) * 100) / 100),
    [subtotal, budgetDiscountAmount],
  );

  const schedulePreview = useMemo(() => {
    const safeDelivery = endDate && endDate >= startDate ? endDate : startDate;
    const effCond =
      service === "mensal"
        ? "cash"
        : installmentsCount > 1 && paymentCondition === "cash"
          ? "installments"
          : paymentCondition;
    return paymentSchedule(
      baseTotal,
      effCond,
      {
        service,
        subtype: subtype.trim() || null,
        startDate,
        deliveryDate: safeDelivery,
        months: service === "mensal" ? Math.max(1, months || 1) : 1,
        manualUrl: "",
        paymentCondition: effCond,
        applyCashDiscount:
          service !== "mensal" && !progressiveDiscounts && effCond === "cash" && installmentsCount === 1
            ? applyCashDiscount
            : false,
        progressiveDiscounts: service !== "mensal" ? progressiveDiscounts : false,
        installmentsCount: service !== "mensal" ? installmentsCount : 1,
        maxInstallments: service !== "mensal" ? maxInstallments : 1,
        deliveryDeadline: deliveryDeadline.trim() || null,
        attachments: [],
      },
    );
  }, [
    baseTotal,
    service,
    subtype,
    startDate,
    endDate,
    months,
    paymentCondition,
    progressiveDiscounts,
    applyCashDiscount,
    installmentsCount,
    maxInstallments,
    deliveryDeadline,
  ]);

  const interestFreeScenarios = useMemo(() => {
    if (service === "mensal" || baseTotal <= 0) return [];
    const safeDelivery = endDate && endDate >= startDate ? endDate : startDate;
    return buildInterestFreeOptions(baseTotal, startDate, safeDelivery, 4, progressiveDiscounts);
  }, [service, baseTotal, startDate, endDate, progressiveDiscounts]);

  const providerBreakdown = useMemo(() => {
    const customFee = sellerFeeInput.trim() !== "" ? parseNum(sellerFeeInput) : undefined;
    const chargedTotal = Math.round(schedulePreview.reduce((acc, s) => acc + s.amount, 0) * 100) / 100;
    return calcProviderFeeBreakdown(chargedTotal, installmentsCount, paymentCondition, customFee);
  }, [schedulePreview, installmentsCount, paymentCondition, sellerFeeInput]);

  const cashExtraDiscount = useMemo(() => {
    if (service === "mensal") return 0;
    const finalSum = schedulePreview.reduce((acc, s) => acc + s.amount, 0);
    return Math.max(0, Math.round((baseTotal - finalSum) * 100) / 100);
  }, [service, schedulePreview, baseTotal]);

  const totalDiscount = Math.round((budgetDiscountAmount + cashExtraDiscount) * 100) / 100;
  const finalTotal = Math.round(schedulePreview.reduce((acc, s) => acc + s.amount, 0) * 100) / 100;

  useEffect(() => {
    let active = true;
    fetch(`/api/budgets/${budgetId}/sale/`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((st) => {
        if (active && st && typeof st.exists === "boolean") {
          setExistingStatus({
            exists: st.exists,
            accepted: Boolean(st.accepted),
            versionNumber: Number(st.versionNumber || 0),
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [budgetId]);

  useEffect(() => {
    let active = true;
    fetch("/api/deals/")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => {
        if (active) {
          setDeals(
            (j.items || []).filter(
              (d: { contactId: string; stage: string }) =>
                d.contactId === contactId && !["won", "lost"].includes(d.stage),
            ),
          );
        }
      })
      .catch(() => {
        /* Uma negociação nova será criada se a lista estiver indisponível. */
      });
    return () => {
      active = false;
    };
  }, [contactId]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled):not([type="file"]), select:not(:disabled), a[href]',
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [onClose]);

  const handleServiceChange = (nextService: SaleService) => {
    setService(nextService);
    const defaultSub = PROJECT_SUBTYPES[nextService]?.[0] || "";
    setSubtype(defaultSub);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (uploading) throw new Error("Aguarde o envio dos arquivos terminar.");
      if (existingStatus?.accepted) {
        throw new Error("Esta proposta já foi aceita e não pode ser modificada.");
      }
      if (existingStatus?.exists && !replaceExisting) {
        throw new Error(
          "Autorize explicitamente a criação de uma nova versão antes de substituir o link e snapshot existentes.",
        );
      }
      const effCond =
        service === "mensal"
          ? "cash"
          : installmentsCount > 1 && paymentCondition === "cash"
            ? "installments"
            : paymentCondition;
      const r = await fetch(`/api/budgets/${budgetId}/sale/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          subtype: subtype.trim() || null,
          startDate,
          deliveryDate: endDate,
          months,
          paymentCondition: effCond,
          applyCashDiscount:
            service !== "mensal" && !progressiveDiscounts && effCond === "cash" && installmentsCount === 1
              ? applyCashDiscount
              : false,
          progressiveDiscounts: service !== "mensal" ? progressiveDiscounts : false,
          installmentsCount: service !== "mensal" ? installmentsCount : 1,
          maxInstallments: service !== "mensal" ? maxInstallments : 1,
          replaceExisting: existingStatus?.exists ? replaceExisting : undefined,
          sellerFeePercent: sellerFeeInput.trim() !== "" ? parseNum(sellerFeeInput) : undefined,
          discountType: progressiveDiscounts ? "percent" : discountType,
          discountValue: progressiveDiscounts ? 0 : parseNum(discountValue),
          deliveryDeadline: deliveryDeadline.trim() || null,
          attachments,
          dealId: dealId || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Não foi possível gerar o link.");
      setUrl(j.url);
      if (j.sale?.token) setToken(j.sale.token);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar link.");
    } finally {
      setBusy(false);
    }
  }

  const subtypeOptions = PROJECT_SUBTYPES[service] || [];

  return (
    <div className="kb-modal-back" onClick={onClose}>
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-title"
        className="kb-modal max-h-[92vh] w-full max-w-2xl overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#E80EFD]">
              {budget?.code ? `Proposta ${budget.code}` : "Proposta comercial"}
            </p>
            <h2 id="sale-title" className="text-xl font-semibold">
              {url ? "Link de proposta e aceite pronto" : "Configurar link da proposta comercial"}
            </h2>
          </div>
          <button type="button" className="kb-btn min-h-11" onClick={onClose} autoFocus>
            Fechar
          </button>
        </div>

        <p className="my-3 text-sm kb-muted">
          Configure a categoria, subtipo do projeto, condições de pagamento, parcelas e materiais de apoio. O link público já inclui visualização e download integrados do PDF comercial de 2 páginas.
        </p>

        {error && (
          <p role="alert" className="my-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {url ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              <p className="font-semibold">Link gerado e condições comerciais sincronizadas com sucesso.</p>
              <p className="mt-1 text-xs text-emerald-200/80">
                A página pública exibe a proposta interativa, o PDF atualizado para visualização/download e o formulário de aceite eletrônico.
              </p>
            </div>

            <label className="kb-field">
              Link público da proposta e aceite
              <input className="kb-control text-base" readOnly value={url} />
            </label>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                className="kb-btn min-h-11"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                  } catch {
                    setError("Selecione e copie o link acima.");
                  }
                }}
              >
                {copied ? "Link copiado" : "Copiar link"}
              </button>
              <a className="kb-btn min-h-11" href={url} target="_blank" rel="noreferrer">
                Revisar proposta web
              </a>
              {token && (
                <a
                  className="kb-btn min-h-11"
                  href={`/api/proposals/${token}/pdf/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Baixar PDF atualizado
                </a>
              )}
            </div>

            {/* Resumo das condições publicadas */}
            <div className="rounded-xl border border-[var(--kb-line)] bg-white/[0.02] p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] kb-muted">
                Resumo publicado no link
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <div>
                  <span className="block text-xs kb-muted">Categoria / Subtipo</span>
                  <strong>
                    {SERVICE_LABELS[service]}
                    {subtype ? ` · ${subtype}` : ""}
                  </strong>
                </div>
                <div>
                  <span className="block text-xs kb-muted">Valor original / Descontos</span>
                  <strong>
                    {formatBRL(subtotal)}
                    {totalDiscount > 0 ? ` (−${formatBRL(totalDiscount)})` : " (sem desconto)"}
                  </strong>
                </div>
                <div>
                  <span className="block text-xs kb-muted">Valor final</span>
                  <strong className="text-[#E80EFD]">{formatBRL(finalTotal)}</strong>
                </div>
              </div>
              <div className="mt-3 border-t border-[var(--kb-line)] pt-2.5">
                <span className="block text-xs kb-muted">Parcelas previstas no aceite</span>
                <ul className="mt-1 space-y-1 text-xs">
                  {schedulePreview.map((s, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{s.label}</span>
                      <strong>
                        {formatBRL(s.amount)} · venc. {s.dueDate.split("-").reverse().join("/")}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="kb-field">
                Categoria do projeto
                <select
                  className="kb-control min-h-11 text-base"
                  value={service}
                  onChange={(e) => handleServiceChange(e.target.value as SaleService)}
                >
                  {Object.entries(SERVICE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="kb-field">
                Subtipo do projeto
                <input
                  className="kb-control min-h-11 text-base"
                  list="sale-subtype-list"
                  placeholder="Ex.: Landing Page ou E-commerce e Gestão"
                  value={subtype}
                  onChange={(e) => setSubtype(e.target.value)}
                />
                <datalist id="sale-subtype-list">
                  {subtypeOptions.map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </label>
            </div>

            {subtypeOptions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs kb-muted">Subtipos sugeridos:</span>
                {subtypeOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSubtype(opt)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      subtype === opt
                        ? "border-[#E80EFD]/60 bg-[#E80EFD]/15 text-[#EDE6EC]"
                        : "border-[var(--kb-line)] text-[var(--kb-muted)] hover:border-white/30"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="kb-field">
                Início previsto
                <input
                  className="kb-control min-h-11 text-base"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>

              {service === "mensal" ? (
                <label className="kb-field">
                  Duração do plano (meses)
                  <input
                    className="kb-control min-h-11 text-base"
                    type="number"
                    min={1}
                    max={36}
                    required
                    value={months || ""}
                    onChange={(e) => setMonths(Number(e.target.value))}
                  />
                </label>
              ) : (
                <label className="kb-field">
                  Data limite / entrega final
                  <input
                    className="kb-control min-h-11 text-base"
                    type="date"
                    required
                    min={startDate}
                    value={deliveryDate}
                    onChange={(e) => setDelivery(e.target.value)}
                  />
                </label>
              )}

              <label className="kb-field">
                Prazo estimado (texto comercial)
                <input
                  className="kb-control min-h-11 text-base"
                  placeholder="Ex.: 7 a 12 dias úteis"
                  value={deliveryDeadline}
                  onChange={(e) => setDeliveryDeadline(e.target.value)}
                />
              </label>
            </div>

            {/* Condição de pagamento, parcelas (1x a 4x) e descontos progressivos */}
            {service !== "mensal" && (
              <div className="space-y-3 rounded-xl border border-[var(--kb-line)] bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] kb-muted">
                    Condição de pagamento e parcelamento (1x a 4x via PIX)
                  </p>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-[#EDE6EC]">
                    <input
                      type="checkbox"
                      checked={progressiveDiscounts}
                      onChange={(e) => {
                        setProgressiveDiscounts(e.target.checked);
                        if (e.target.checked) {
                          setApplyCashDiscount(false);
                          setDiscountValue("");
                        }
                      }}
                    />
                    <span>Descontos progressivos (1x 10%, 2x 6%, 3x 3%, 4x 0%)</span>
                  </label>
                </div>

                {/* Seletor rápido de 1x, 2x, 3x ou 4x */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {interestFreeScenarios.map((sc) => {
                    const active = installmentsCount === sc.count;
                    return (
                      <button
                        key={sc.count}
                        type="button"
                        onClick={() => {
                          setInstallmentsCount(sc.count);
                          if (sc.count > 1 && paymentCondition === "cash") {
                            setPaymentCondition("installments");
                            setApplyCashDiscount(false);
                          }
                        }}
                        aria-pressed={active}
                        className={`rounded-xl border p-2.5 text-left text-xs transition ${
                          active
                            ? "border-[#E80EFD]/60 bg-[#E80EFD]/12"
                            : "border-[var(--kb-line)] hover:border-white/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <strong className="text-sm">
                            {sc.count === 1 ? "À vista (1x)" : `${sc.count}x sem juros`}
                          </strong>
                          {sc.discountPercent > 0 && (
                            <span className="rounded bg-[#E80EFD]/25 px-1.5 py-0.5 text-[10px] font-bold text-[#EDE6EC]">
                              −{sc.discountPercent}%
                            </span>
                          )}
                        </div>
                        <span className="mt-0.5 block font-medium text-[#EDE6EC]">
                          {formatBRL(sc.regularAmount)}
                          {sc.firstAmount !== sc.regularAmount ? ` (1ª ${formatBRL(sc.firstAmount)})` : ""}
                        </span>
                        <span className="mt-0.5 block text-[10px] kb-muted">
                          Total: {formatBRL(sc.total)}
                          {sc.discountAmount > 0 ? ` (−${formatBRL(sc.discountAmount)})` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  {PAYMENT_CONDITIONS.map((p) => {
                    const active = paymentCondition === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPaymentCondition(p.id);
                          if (p.id === "cash") {
                            setInstallmentsCount(1);
                          } else if (p.id === "installments" && installmentsCount === 1) {
                            setInstallmentsCount(2);
                          }
                        }}
                        aria-pressed={active}
                        className={`rounded-xl border px-3 py-2.5 text-left text-xs transition ${
                          active
                            ? "border-[#E80EFD]/60 bg-[#E80EFD]/10"
                            : "border-[var(--kb-line)] hover:border-white/30"
                        }`}
                      >
                        <strong className="block text-sm">{p.label}</strong>
                        <span className="mt-0.5 block kb-muted">{p.hint}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="kb-field">
                    Parcelas na emissão (1 a 4)
                    <select
                      className="kb-control min-h-11 text-sm"
                      value={installmentsCount}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setInstallmentsCount(n);
                        if (n > 1 && paymentCondition === "cash") {
                          setPaymentCondition("installments");
                          setApplyCashDiscount(false);
                        }
                      }}
                    >
                      {[1, 2, 3, 4].map((n) => {
                        const sc = interestFreeScenarios.find((s) => s.count === n);
                        return (
                          <option key={n} value={n}>
                            {n}x sem juros — {sc ? formatBRL(sc.regularAmount) : formatBRL(baseTotal / n)}
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <label className="kb-field">
                    Máximo permitido à cliente
                    <select
                      className="kb-control min-h-11 text-sm"
                      value={maxInstallments}
                      onChange={(e) => setMaxInstallments(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          Até {n}x sem juros
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="kb-field">
                    <span>Desconto comercial no orçamento</span>
                    <div className="flex items-center gap-1.5">
                      <select
                        aria-label="Tipo de desconto"
                        className="kb-control min-h-11 w-20 text-sm"
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as DiscountType)}
                      >
                        <option value="fixed">R$</option>
                        <option value="percent">%</option>
                      </select>
                      <input
                        className="kb-control min-h-11 flex-1 text-sm"
                        inputMode="decimal"
                        placeholder={discountType === "percent" ? "0%" : "0,00"}
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value.replace(/[^\d.,]/g, ""))}
                      />
                    </div>
                  </div>
                </div>

                {paymentCondition === "cash" && installmentsCount === 1 && (
                  <label className="flex items-center gap-2.5 rounded-xl border border-[var(--kb-line)] px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={applyCashDiscount}
                      onChange={(e) => setApplyCashDiscount(e.target.checked)}
                    />
                    <span>
                      Aplicar 10% de desconto à vista opcional ({formatBRL(baseTotal * 0.9)}) — desmarcado por padrão
                    </span>
                  </label>
                )}

                {/* Verificação do meio de pagamento e distinção: valor cobrado à cliente vs. custo do vendedor */}
                <div className="rounded-xl border border-[var(--kb-line)] bg-black/25 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-[#EDE6EC]">
                      Meio de pagamento ({providerBreakdown.method === "card_gateway" ? "Cartão / Gateway" : "Pix / Transferência Direta"}): suporta até 4x sem juros
                    </strong>
                    <div className="flex items-center gap-1.5">
                      <span className="kb-muted">Taxa provedor (%):</span>
                      <input
                        className="kb-control h-7 w-16 px-2 py-0.5 text-right text-xs"
                        inputMode="decimal"
                        placeholder={String(providerBreakdown.providerFeePercent)}
                        value={sellerFeeInput}
                        onChange={(e) => setSellerFeeInput(e.target.value.replace(/[^\d.,]/g, ""))}
                      />
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[var(--kb-line)] pt-2">
                    <div>
                      <span className="block kb-muted">Valor cobrado à cliente</span>
                      <strong className="text-[#EDE6EC]">
                        {formatBRL(providerBreakdown.clientChargedTotal)} (0% juros)
                      </strong>
                    </div>
                    <div>
                      <span className="block kb-muted">Custo assumido pelo vendedor</span>
                      <strong>
                        {formatBRL(providerBreakdown.sellerAbsorbedCost)} ({providerBreakdown.providerFeePercent}%)
                      </strong>
                    </div>
                    <div>
                      <span className="block kb-muted">Líquido estimado (vendedor)</span>
                      <strong className="text-emerald-300">
                        {formatBRL(providerBreakdown.sellerNetReceived)}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Resumo claro: Valor original, Descontos, Valor final e Parcelas */}
            <div
              className="rounded-xl border border-[#E80EFD]/25 bg-[#E80EFD]/[0.05] p-4 text-sm"
              aria-live="polite"
            >
              <div className="grid grid-cols-3 gap-2 border-b border-[var(--kb-line)] pb-3">
                <div>
                  <span className="block text-xs kb-muted">Valor original</span>
                  <strong>{formatBRL(subtotal)}</strong>
                </div>
                <div>
                  <span className="block text-xs kb-muted">Descontos</span>
                  <strong>{totalDiscount > 0 ? `−${formatBRL(totalDiscount)}` : formatBRL(0)}</strong>
                </div>
                <div>
                  <span className="block text-xs kb-muted">Valor final</span>
                  <strong className="text-base text-[#E80EFD]">{formatBRL(finalTotal)}</strong>
                </div>
              </div>

              <div className="mt-3">
                <span className="block text-xs font-medium uppercase tracking-wider kb-muted">
                  Parcelas que serão apresentadas na proposta ({schedulePreview.length}x)
                </span>
                <ul className="mt-1.5 space-y-1 text-xs">
                  {schedulePreview.map((item, idx) => (
                    <li key={idx} className="flex items-center justify-between">
                      <span>{item.label}</span>
                      <strong>
                        {formatBRL(item.amount)} · venc. {item.dueDate.split("-").reverse().join("/")}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <label className="kb-field">
              Negociação no funil
              <select
                className="kb-control text-base"
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
              >
                <option value="">Criar negociação (ou reutilizar a deste link)</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </label>

            <SaleMaterials
              budgetId={budgetId}
              value={attachments}
              onChange={setAttachments}
              onBusy={setUploading}
            />

            {existingStatus?.accepted && (
              <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-3.5 text-xs text-amber-200">
                <strong>Proposta já aceita e formalizada:</strong> O snapshot e contrato emitidos estão protegidos e não podem ser sobrescritos.
              </div>
            )}

            {existingStatus?.exists && !existingStatus.accepted && (
              <label className="flex items-start gap-2.5 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3.5 text-xs text-amber-100">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                />
                <span>
                  <strong>Link ativo detectado (versão v{existingStatus.versionNumber}):</strong> Autorizo explicitamente criar uma nova versão da proposta (v{existingStatus.versionNumber + 1}) e substituir o link/snapshot anterior.
                </span>
              </label>
            )}

            <button
              className="kb-btn min-h-12 w-full"
              disabled={busy || uploading || Boolean(existingStatus?.accepted)}
            >
              {uploading
                ? "Enviando arquivos…"
                : busy
                  ? "Salvando e gerando link…"
                  : existingStatus?.exists
                    ? `Gerar nova versão da proposta (v${existingStatus.versionNumber + 1})`
                    : "Gerar link de aceite"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

