#!/usr/bin/env node
/**
 * KBOS Preflight Check (scripts/kbos-preflight.mjs)
 * Verifica no início de cada sessão:
 * 1. Repositório e worktrees ativos
 * 2. Branch e commit atuais (HEAD vs origin/main)
 * 3. Divergência em relação à produção (https://kbos.kayquebrito.com.br/api/health/)
 * 4. Host do banco configurado (sem expor credenciais) e bloqueio do Neon antigo
 * 5. Alterações locais pendentes (git status -s)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PROD_HEALTH_URL =
  process.env.KBOS_PROD_HEALTH_URL || "https://kbos.kayquebrito.com.br/api/health/";
const DEPRECATED_NEON_CLUSTERS = ["ep-dawn-wildflower-b5k6i390"];

function runGit(args) {
  try {
    return execSync(`git ${args}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function extractHostSafe(rawUrl) {
  if (!rawUrl) return "(nao configurado)";
  const cleaned = rawUrl.trim().replace(/^['"]|['"]$/g, "");
  try {
    return new URL(cleaned).hostname.toLowerCase();
  } catch {
    const m = cleaned.match(/@([^:/?#\s]+)/);
    return m ? m[1].toLowerCase() : "(formato invalido)";
  }
}

function readEnvFileVar(filePath, key) {
  if (!fs.existsSync(filePath)) return undefined;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const k = trimmed.slice(0, idx).trim();
    if (k === key) {
      return trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return undefined;
}

async function fetchProdHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(PROD_HEALTH_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return {
      ok: Boolean(data.ok),
      commit: typeof data.commit === "string" ? data.commit : null,
      dbOk: Boolean(data.checks?.db?.ok),
      dbMs: data.checks?.db?.ms ?? null,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const strict = process.argv.includes("--strict");
  const warnings = [];

  const topLevel = runGit("rev-parse --show-toplevel") || process.cwd();
  const originUrl = runGit("remote get-url origin") || "(sem remote origin)";
  const branch = runGit("rev-parse --abbrev-ref HEAD") || "(detached)";
  const headSha = runGit("rev-parse HEAD");
  const originMainSha = runGit("rev-parse origin/main");
  const behindAhead = runGit("rev-list --left-right --count HEAD...origin/main");
  const [aheadStr = "0", behindStr = "0"] = behindAhead.split(/\s+/);
  const ahead = Number(aheadStr) || 0;
  const behind = Number(behindStr) || 0;

  const worktreesRaw = runGit("worktree list");
  const statusShort = runGit("status -s");

  const envLocalPath = path.join(topLevel, ".env.local");
  const envPath = path.join(topLevel, ".env");
  const rawDbUrl =
    process.env.DATABASE_URL ??
    readEnvFileVar(envLocalPath, "DATABASE_URL") ??
    readEnvFileVar(envPath, "DATABASE_URL");
  const dbSource = process.env.DATABASE_URL
    ? "process.env"
    : fs.existsSync(envLocalPath) && readEnvFileVar(envLocalPath, "DATABASE_URL")
      ? ".env.local"
      : fs.existsSync(envPath) && readEnvFileVar(envPath, "DATABASE_URL")
        ? ".env"
        : "nenhum";
  const dbDriver =
    process.env.DATABASE_DRIVER ??
    readEnvFileVar(envLocalPath, "DATABASE_DRIVER") ??
    readEnvFileVar(envPath, "DATABASE_DRIVER") ??
    "neon (default)";

  const dbHost = extractHostSafe(rawDbUrl);
  const isDeprecatedNeon = DEPRECATED_NEON_CLUSTERS.some((c) => dbHost.includes(c));
  const allowDeprecated = process.env.KBOS_ALLOW_DEPRECATED_NEON === "1";

  const prod = await fetchProdHealth();

  if (behind > 0) {
    warnings.push(
      `Branch local (${branch}) esta ${behind} commit(s) atras de origin/main (${originMainSha.slice(0, 7)}).`
    );
  }
  if (prod.commit && headSha && prod.commit !== headSha) {
    warnings.push(
      `HEAD local (${headSha.slice(0, 7)}) diverge do commit em producao (${prod.commit.slice(0, 7)}).`
    );
  }
  if (isDeprecatedNeon && !allowDeprecated) {
    warnings.push(
      `DATABASE_URL (${dbSource}) aponta para o cluster Neon descontinuado (${dbHost}). Conexoes via lib/kbos/db.ts estao BLOQUEADAS por padrao. Para operacoes em producao, utilize a API autenticada de https://kbos.kayquebrito.com.br.`
    );
  }

  console.log("=== KBOS PREFLIGHT CHECK ===");
  console.log(`1. Repositorio : ${topLevel}`);
  console.log(`   Remote      : ${originUrl}`);
  console.log(`   Worktrees   : ${worktreesRaw ? worktreesRaw.split("\n").length : 1} registrado(s)`);
  console.log(`2. Git State   : branch=${branch} | HEAD=${headSha ? headSha.slice(0, 7) : "?"} | origin/main=${originMainSha ? originMainSha.slice(0, 7) : "?"} (ahead=${ahead}, behind=${behind})`);
  if (prod.commit) {
    const syncLabel = prod.commit === headSha ? "SINCRONIZADO" : "DIVERGENTE";
    console.log(
      `3. Producao    : commit=${prod.commit.slice(0, 7)} [${syncLabel}] | db_ok=${prod.dbOk} (${prod.dbMs ?? "?"}ms)`
    );
  } else {
    console.log(`3. Producao    : indisponivel (${prod.error || prod.status || "erro"})`);
  }
  console.log(
    `4. Database    : host=${dbHost} (fonte: ${dbSource}, driver: ${dbDriver}) ${
      isDeprecatedNeon
        ? allowDeprecated
          ? "[NEON ANTIGO - EXCECAO AUTORIZADA]"
          : "[BLOQUEADO: NEON DESCONTINUADO]"
        : "[OK]"
    }`
  );
  const statusLines = statusShort ? statusShort.split("\n").filter(Boolean) : [];
  console.log(`5. Working Tree: ${statusLines.length} alteracao(oes) local(is) pendente(s)`);
  for (const line of statusLines) {
    console.log(`   ${line}`);
  }

  if (warnings.length > 0) {
    console.log("\n--- ALERTAS PREFLIGHT ---");
    for (const w of warnings) {
      console.log(`[ALERTA] ${w}`);
    }
    if (strict) {
      process.exitCode = 2;
    }
  } else {
    console.log("\n[OK] Ambiente verificado sem divergencias criticas.");
  }
}

main();

