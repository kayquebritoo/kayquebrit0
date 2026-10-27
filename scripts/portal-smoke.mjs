// Teste rápido do portal com a conta de cliente de teste (somente leitura: não cria nem altera nada).
// Uso:
//   KBOS_TEST_EMAIL=... KBOS_TEST_PASSWORD=... node scripts/portal-smoke.mjs
// Opcionais: KBOS_URL (padrão produção) e KBOS_TEST_FOREIGN_PROJECT (id de um projeto de OUTRO cliente,
// para conferir o isolamento). A senha nunca vai para o repositório nem para logs.
const B = (process.env.KBOS_URL || "https://kbos.kayquebrito.com.br").replace(/\/+$/, "");
const EMAIL = process.env.KBOS_TEST_EMAIL;
const PASSWORD = process.env.KBOS_TEST_PASSWORD;
const FOREIGN = process.env.KBOS_TEST_FOREIGN_PROJECT || "";
if (!EMAIL || !PASSWORD) {
  console.error("Defina KBOS_TEST_EMAIL e KBOS_TEST_PASSWORD.");
  process.exit(2);
}

// Campos que só a equipe pode ver.
const INTERNAL = ["valor", "budgetId", "briefingId", "contactId", "clienteId", "courseId", "postLimit"];
let cookie = "";
const results = [];
const check = (name, ok, info = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` — ${info}` : ""}`);
};
async function call(method, path, body) {
  const r = await fetch(B + path, {
    method,
    redirect: "manual",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch { /* página/HTML */ }
  return { status: r.status, data, headers: r.headers };
}

const login = await call("POST", "/api/auth/login/", { email: EMAIL, password: PASSWORD });
const set = login.headers.get("set-cookie") || "";
cookie = (set.match(/kbos_session=[^;]+/) || [""])[0];
check("login por senha", login.status === 200 && !!cookie, String(login.status));
if (!cookie) process.exit(1);

const me = await call("GET", "/api/auth/me/");
check("sessão é de cliente", me.data?.user?.role === "cliente", me.data?.user?.role);

const list = await call("GET", "/api/projects/");
const items = list.data?.items ?? [];
check("lista de projetos abre", list.status === 200 && items.length > 0, `${list.status} · ${items.length} projeto(s)`);
const leaked = items.flatMap((p) => INTERNAL.filter((k) => k in p));
check("lista sem campos internos", leaked.length === 0, leaked.join(", "));
const own = items[0]?.id;
if (own) {
  const d = await call("GET", `/api/projects/${own}/`);
  check("detalhe do próprio projeto sem campos internos", d.status === 200 && INTERNAL.every((k) => !(k in (d.data?.item ?? {}))), String(d.status));
  for (const p of [`/api/projects/${own}/files/`, `/api/projects/${own}/chat/`, `/api/portal/report/?projectId=${own}`]) {
    const r = await call("GET", p);
    check(`abre ${p.split("?")[0]}`, r.status === 200, String(r.status));
  }
  const patch = await call("PATCH", `/api/projects/${own}/`, { status: "entregue" });
  check("cliente não muda a etapa do projeto", patch.status === 403, String(patch.status));
}
for (const p of ["/api/portal/overview/", "/api/portal/posts/", "/api/portal/lume/?check=1"]) {
  const r = await call("GET", p);
  check(`abre ${p}`, r.status === 200, String(r.status));
}
if (FOREIGN) {
  if (items.some((p) => p.id === FOREIGN)) check("projeto alheio informado é mesmo de outro cliente", false, "a conta de teste enxerga esse projeto");
  for (const p of [`/api/projects/${FOREIGN}/`, `/api/projects/${FOREIGN}/files/`, `/api/projects/${FOREIGN}/chat/`, `/api/portal/report/?projectId=${FOREIGN}`, `/api/portal/lume/takes/?projectId=${FOREIGN}`]) {
    const r = await call("GET", p);
    check(`projeto alheio bloqueado ${p.split("?")[0]}`, r.status === 403 || r.status === 404, String(r.status));
  }
} else {
  console.log("(pulei o isolamento: defina KBOS_TEST_FOREIGN_PROJECT)");
}
for (const p of ["/api/admin/reports/", "/api/contacts/", "/api/budgets/", "/api/admin/social/", "/api/events/", "/api/plans/", "/api/admin/whatsapp/health/"]) {
  const r = await call("GET", p);
  check(`área do admin bloqueada ${p}`, r.status === 401 || r.status === 403, String(r.status));
}
const page = await call("GET", "/portal/");
check("página /portal abre", page.status === 200, String(page.status));
check("página com X-Frame-Options", page.headers.get("x-frame-options") === "SAMEORIGIN", page.headers.get("x-frame-options") ?? "ausente");
check("página com HSTS", !!page.headers.get("strict-transport-security"));

await call("POST", "/api/auth/logout/");
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passaram`);
process.exit(passed === results.length ? 0 : 1);
