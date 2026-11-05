#!/usr/bin/env node
/**
 * Recuperacao segura dos 4 registros de Luana Nakata (Sorella Import) em producao
 * via API oficial autenticada (https://kbos.kayquebrito.com.br).
 *
 * Garantias de seguranca e integridade:
 * 1. Senha administrativa solicitada com digitacao 100% oculta (flag muted no readline),
 *    mantida apenas em memoria volátil e jamais gravada em logs ou arquivos.
 * 2. Usa exclusivamente a API autenticada (/api/auth/login/, /api/contacts/, /api/budgets/, /api/tasks/),
 *    sem KBOS_ADMIN_BYPASS_TOKEN.
 * 3. Verifica duplicidades antes de cada etapa (idempotente em caso de falha parcial).
 * 4. Ambas as propostas permanecem como "draft" (R$ 2.500,00 e R$ 9.800,00), sem gerar
 *    cobrancas, contratos fechados ou lancamentos financeiros.
 * 5. Tarefa vinculada a Luana (contactId) com vencimento em 05/11/2026 as 18:00 America/Belem
 *    (2026-11-05T21:00:00.000Z).
 */
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const BASE_URL = (process.env.KBOS_PROD_URL || "https://kbos.kayquebrito.com.br").replace(/\/+$/, "");

export function buildContactPayload() {
  return {
    name: "Luana Nakata",
    company: "Sorella Import",
    status: "lead",
    kind: "pj",
    source: "Proposta Comercial",
    notes:
      "Cliente com duas alternativas comerciais (nao cumulativas) via PIX direto com descontos progressivos: Proposta 1 (Landing Page — base R$ 2.500,00: 1x R$ 2.250,00 [-10%], 2x R$ 2.350,00 [-6%], 3x R$ 2.425,00 [-3%], 4x R$ 2.500,00 [0%], prazo 7 a 12 dias uteis) e Proposta 2 (E-commerce e Gestao — base R$ 9.800,00: 1x R$ 8.820,00 [-10%], 2x R$ 9.212,00 [-6%], 3x R$ 9.506,00 [-3%], 4x R$ 9.800,00 [0%], prazo 45 a 60 dias).",
  };
}

export function buildBudget1Payload(contactId) {
  return {
    title: "Proposta 1 — Landing Page",
    contactId,
    clientName: "Luana Nakata",
    clientCompany: "Sorella Import",
    status: "draft",
    paymentCondition: "cash",
    validUntil: "2026-11-20",
    deliveryDeadline: "7 a 12 dias úteis",
    terms:
      "Alternativa Comercial 1 — Desenvolvimento de Landing Page. Prazo estimado de entrega: 7 a 12 dias úteis. Condições de pagamento via PIX direto com descontos progressivos (sem acúmulo): À vista (1x) com 10% OFF por R$ 2.250,00 (economia de R$ 250,00); 2x com 6% OFF por R$ 2.350,00 (2x de R$ 1.175,00); 3x com 3% OFF por R$ 2.425,00 (1ª de R$ 808,34 + 2x de R$ 808,33); ou 4x sem desconto por R$ 2.500,00 (4x de R$ 625,00).",
    items: [
      {
        service: "Landing Page",
        description:
          "Desenvolvimento de Landing Page (Prazo estimado: 7 a 12 dias úteis · PIX com descontos progressivos: 1x R$ 2.250,00 [-10%] · 2x R$ 2.350,00 [-6%] · 3x R$ 2.425,00 [-3%] · 4x R$ 2.500,00 [0%])",
        quantity: 1,
        unitPrice: 2500,
      },
    ],
  };
}

export function buildBudget2Payload(contactId) {
  return {
    title: "Proposta 2 — E-commerce e Gestão",
    contactId,
    clientName: "Luana Nakata",
    clientCompany: "Sorella Import",
    status: "draft",
    paymentCondition: "cash",
    validUntil: "2026-11-20",
    deliveryDeadline: "45 a 60 dias",
    terms:
      "Alternativa Comercial 2 — Desenvolvimento de E-commerce e Gestão. Prazo estimado de entrega: 45 a 60 dias. Condições de pagamento via PIX direto com descontos progressivos (sem acúmulo): À vista (1x) com 10% OFF por R$ 8.820,00 (economia de R$ 980,00); 2x com 6% OFF por R$ 9.212,00 (2x de R$ 4.606,00); 3x com 3% OFF por R$ 9.506,00 (1ª de R$ 3.168,68 + 2x de R$ 3.168,66); ou 4x sem desconto por R$ 9.800,00 (4x de R$ 2.450,00).",
    items: [
      {
        service: "E-commerce e Gestão",
        description:
          "Desenvolvimento de E-commerce e Gestão (Prazo estimado: 45 a 60 dias · PIX com descontos progressivos: 1x R$ 8.820,00 [-10%] · 2x R$ 9.212,00 [-6%] · 3x R$ 9.506,00 [-3%] · 4x R$ 9.800,00 [0%])",
        quantity: 1,
        unitPrice: 9800,
      },
    ],
  };
}

export function buildTaskPayload(contactId, budget1, budget2) {
  return {
    titulo: "Enviar orçamento para Luana — Sorella Import",
    description: `Enviar e apresentar as duas alternativas comerciais com descontos progressivos via PIX para Luana Nakata (Sorella Import): Proposta 1 (${budget1.code} — Landing Page, de R$ 2.250,00 à vista [-10%] a R$ 2.500,00 em 4x, ID: ${budget1.id}) e Proposta 2 (${budget2.code} — E-commerce e Gestão, de R$ 8.820,00 à vista [-10%] a R$ 9.800,00 em 4x, ID: ${budget2.id}).`,
    status: "todo",
    priority: "alta",
    dueAt: "2026-11-05T21:00:00.000Z", // 05/11/2026 às 18:00 no fuso America/Belem (-03:00)
    contactId,
  };
}

export function buildSaleLinkPlan(kind) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Belem" });
  const isLanding = kind === "landing";
  const [y, m, d] = today.split("-").map(Number);
  const deliveryDate = new Date(Date.UTC(y, m - 1, d + (isLanding ? 15 : 60)))
    .toISOString()
    .slice(0, 10);
  return {
    service: "site",
    subtype: isLanding ? "Landing Page" : "E-commerce e Gestão",
    startDate: today,
    deliveryDate,
    months: 1,
    paymentCondition: "cash",
    installmentsCount: 1,
    maxInstallments: 4,
    progressiveDiscounts: true,
    applyCashDiscount: false,
    deliveryDeadline: isLanding ? "7 a 12 dias úteis" : "45 a 60 dias",
    replaceExisting: true,
  };
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    let muted = false;
    const origWrite = rl._writeToOutput;
    rl._writeToOutput = function (stringToWrite) {
      if (!muted) {
        origWrite.call(rl, stringToWrite);
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
    muted = true;
  });
}

async function apiRequest(path, { method = "GET", cookie, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} em ${method} ${path}: ${JSON.stringify(data)}`);
  }
  return { data, headers: res.headers };
}

async function main() {
  const auditOnly = process.argv.includes("--audit");
  const issueLinks = process.argv.includes("--issue-links");
  const email = process.env.KBOS_ADMIN_EMAIL || "contato@kayquebrito.com.br";
  let password = await promptHidden(`Senha administrativa para ${email} em ${BASE_URL}: `);
  if (!password) {
    console.error("Operacao cancelada: senha vazia.");
    process.exit(1);
  }

  // 1. Autenticacao normal via /api/auth/login/ (sem bypass token)
  const loginRes = await fetch(`${BASE_URL}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  // Limpa referencia da senha imediatamente apos a requisicao
  password = "";

  if (!loginRes.ok) {
    const errBody = await loginRes.text();
    throw new Error(`Falha na autenticacao (${loginRes.status}): ${errBody}`);
  }
  const setCookie = loginRes.headers.get("set-cookie") || "";
  const sessionMatch = setCookie.match(/kbos_session=[^;]+/);
  if (!sessionMatch) {
    throw new Error("Cookie kbos_session nao retornado no login.");
  }
  const cookie = sessionMatch[0];
  console.log("[1/5] Sessao autenticada com sucesso em memoria.");

  // 2. Consultar Contato: Luana Nakata (Sorella Import)
  const { data: qName } = await apiRequest(
    `/api/contacts/?q=${encodeURIComponent("Luana Nakata")}`,
    { cookie }
  );
  const { data: qComp } = await apiRequest(
    `/api/contacts/?q=${encodeURIComponent("Sorella Import")}`,
    { cookie }
  );
  const candidateContacts = [...(qName.items || []), ...(qComp.items || [])];
  let contact = candidateContacts.find(
    (c) =>
      c.name?.trim().toLowerCase() === "luana nakata" ||
      c.company?.trim().toLowerCase() === "sorella import"
  );

  const { data: budgetsList } = await apiRequest("/api/budgets/", { cookie });
  const existingBudgets = (budgetsList.items || []).filter(
    (b) =>
      (contact && b.contactId === contact.id) ||
      b.clientName?.trim().toLowerCase() === "luana nakata" ||
      b.clientCompany?.trim().toLowerCase() === "sorella import"
  );

  let budget1 = existingBudgets.find((b) =>
    b.title?.toLowerCase().includes("landing page")
  );
  let budget2 = existingBudgets.find((b) =>
    b.title?.toLowerCase().includes("e-commerce")
  );

  const { data: tasksList } = await apiRequest("/api/tasks/?open=1", { cookie });
  let task = (tasksList.items || []).find(
    (t) =>
      (contact && t.contactId === contact.id) ||
      (t.titulo?.toLowerCase().includes("luana") && t.titulo?.toLowerCase().includes("sorella"))
  );

  if (auditOnly) {
    let sale1 = null;
    let sale2 = null;
    if (budget1) {
      try {
        sale1 = (await apiRequest(`/api/budgets/${budget1.id}/sale/`, { cookie })).data;
      } catch {
        sale1 = null;
      }
    }
    if (budget2) {
      try {
        sale2 = (await apiRequest(`/api/budgets/${budget2.id}/sale/`, { cookie })).data;
      } catch {
        sale2 = null;
      }
    }
    console.log("\n=== AUDITORIA SOMENTE LEITURA (PRODUCAO) ===");
    console.log(
      JSON.stringify(
        {
          contact: contact || null,
          budget1: budget1 ? { ...budget1, saleStatus: sale1 } : null,
          budget2: budget2 ? { ...budget2, saleStatus: sale2 } : null,
          task: task || null,
        },
        null,
        2
      )
    );
    return;
  }

  if (!contact) {
    const { data: created } = await apiRequest("/api/contacts/", {
      method: "POST",
      cookie,
      body: buildContactPayload(),
    });
    contact = created.item;
    console.log(`[2/5] Contato criado: ${contact.name} (${contact.company}) -> ID: ${contact.id}`);
  } else {
    console.log(`[2/5] Contato ja existente reutilizado (sem duplicar) -> ID: ${contact.id}`);
  }

  if (!budget1) {
    const { data: b1 } = await apiRequest("/api/budgets/", {
      method: "POST",
      cookie,
      body: buildBudget1Payload(contact.id),
    });
    budget1 = b1.item;
    console.log(
      `[3/5] Proposta 1 criada: ${budget1.code} | valor=${budget1.totalAmount} | status=${budget1.status} -> ID: ${budget1.id}`
    );
  } else if (budget1.status === "draft" || (issueLinks && budget1.status === "sent")) {
    const p1 = buildBudget1Payload(contact.id);
    const { data: u1 } = await apiRequest(`/api/budgets/${budget1.id}`, {
      method: "PATCH",
      cookie,
      body: {
        paymentCondition: p1.paymentCondition,
        deliveryDeadline: p1.deliveryDeadline,
        terms: p1.terms,
        items: p1.items,
      },
    });
    budget1 = u1.item || budget1;
    console.log(
      `[3/5] Proposta 1 atualizada com descontos progressivos PIX (sem duplicar): ${budget1.code} -> ID: ${budget1.id}`
    );
  } else {
    console.log(
      `[3/5] Proposta 1 ja existente em status '${budget1.status}' preservada (sem modificar snapshot/aceite): ${budget1.code} -> ID: ${budget1.id}`
    );
  }

  if (!budget2) {
    const { data: b2 } = await apiRequest("/api/budgets/", {
      method: "POST",
      cookie,
      body: buildBudget2Payload(contact.id),
    });
    budget2 = b2.item;
    console.log(
      `[4/5] Proposta 2 criada: ${budget2.code} | valor=${budget2.totalAmount} | status=${budget2.status} -> ID: ${budget2.id}`
    );
  } else if (budget2.status === "draft" || (issueLinks && budget2.status === "sent")) {
    const p2 = buildBudget2Payload(contact.id);
    const { data: u2 } = await apiRequest(`/api/budgets/${budget2.id}`, {
      method: "PATCH",
      cookie,
      body: {
        paymentCondition: p2.paymentCondition,
        deliveryDeadline: p2.deliveryDeadline,
        terms: p2.terms,
        items: p2.items,
      },
    });
    budget2 = u2.item || budget2;
    console.log(
      `[4/5] Proposta 2 atualizada com descontos progressivos PIX (sem duplicar): ${budget2.code} -> ID: ${budget2.id}`
    );
  } else {
    console.log(
      `[4/5] Proposta 2 ja existente em status '${budget2.status}' preservada (sem modificar snapshot/aceite): ${budget2.code} -> ID: ${budget2.id}`
    );
  }

  if (!task) {
    const { data: tCreated } = await apiRequest("/api/tasks/", {
      method: "POST",
      cookie,
      body: buildTaskPayload(contact.id, budget1, budget2),
    });
    task = tCreated.item;
    console.log(
      `[5/5] Tarefa criada (vencimento 05/11/2026 18:00 America/Belem) -> ID: ${task.id}`
    );
  } else {
    console.log(`[5/5] Tarefa ja existente reutilizada (sem duplicar) -> ID: ${task.id}`);
  }

  let link1 = null;
  let link2 = null;
  if (issueLinks) {
    if (["draft", "sent"].includes(budget1.status)) {
      const { data: s1 } = await apiRequest(`/api/budgets/${budget1.id}/sale/`, {
        method: "POST",
        cookie,
        body: buildSaleLinkPlan("landing"),
      });
      link1 = {
        url: `${BASE_URL}${s1.url}`,
        pdfUrl: `${BASE_URL}/api/proposals/${s1.sale?.token}/pdf/`,
        expiresAt: s1.sale?.expiresAt,
      };
    }
    if (["draft", "sent"].includes(budget2.status)) {
      const { data: s2 } = await apiRequest(`/api/budgets/${budget2.id}/sale/`, {
        method: "POST",
        cookie,
        body: buildSaleLinkPlan("ecommerce"),
      });
      link2 = {
        url: `${BASE_URL}${s2.url}`,
        pdfUrl: `${BASE_URL}/api/proposals/${s2.sale?.token}/pdf/`,
        expiresAt: s2.sale?.expiresAt,
      };
    }
  }

  console.log("\n=== RESUMO CONFIRMADO EM PRODUCAO ===");
  console.log(
    JSON.stringify(
      {
        contact: {
          id: contact.id,
          name: contact.name,
          company: contact.company,
          status: contact.status,
        },
        budget1: {
          id: budget1.id,
          code: budget1.code,
          title: budget1.title,
          totalAmount: budget1.totalAmount,
          status: link1 ? "sent" : budget1.status,
          link: link1,
        },
        budget2: {
          id: budget2.id,
          code: budget2.code,
          title: budget2.title,
          totalAmount: budget2.totalAmount,
          status: link2 ? "sent" : budget2.status,
          link: link2,
        },
        task: {
          id: task.id,
          titulo: task.titulo,
          priority: task.priority,
          status: task.status,
          dueAt: task.dueAt,
          contactId: task.contactId,
        },
      },
      null,
      2
    )
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("[ERRO]", err.message || err);
    process.exit(1);
  });
}
