import { describe, expect, it } from "vitest";
import { ALERT_AFTER, REMIND_MS, emptyHealth, nextHealth } from "../wa-health";

const T = 1_800_000_000_000;
describe("monitor do WhatsApp", () => {
  it("conectado: nada a fazer", () => {
    expect(nextHealth(emptyHealth(), "open", T).action).toBe("none");
  });
  it("só alerta depois de falhas seguidas, uma vez", () => {
    let h = emptyHealth();
    let r = nextHealth(h, "close", T); expect(r.action).toBe("none"); h = r.next;
    expect(ALERT_AFTER).toBe(2);
    r = nextHealth(h, "close", T + 120_000); expect(r.action).toBe("alert"); h = r.next;
    r = nextHealth(h, "close", T + 240_000); expect(r.action).toBe("none");
  });
  it("lembra a cada 30 min enquanto cair", () => {
    const h = nextHealth(nextHealth(emptyHealth(), "close", T).next, "close", T + 1).next;
    const r = nextHealth(h, "connecting", T + 1 + REMIND_MS);
    expect(r.action).toBe("remind");
  });
  it("avisa quando volta e zera", () => {
    const h = nextHealth(nextHealth(emptyHealth(), "close", T).next, "close", T + 1).next;
    const r = nextHealth(h, "open", T + 999);
    expect(r.action).toBe("recovered");
    expect(r.next.alertedAt).toBeNull();
  });
  it("oscilação curta (1 falha e volta) não alerta nem avisa", () => {
    const h = nextHealth(emptyHealth(), "unknown", T).next;
    expect(nextHealth(h, "open", T + 1000).action).toBe("none");
  });
});
