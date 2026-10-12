// Bypass aberto da VPS — flag KBOS_BYPASS_ADMIN (puro, sem I/O).
import { describe, expect, it, vi, afterEach } from "vitest";
import { isAdminBypassOpen } from "../admin-access";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isAdminBypassOpen", () => {
  it("fail-closed por padrão (ausente, vazio ou outro valor)", () => {
    delete process.env.KBOS_BYPASS_ADMIN;
    expect(isAdminBypassOpen()).toBe(false);
    for (const v of ["", "false", "0", "yes", "1"]) {
      vi.stubEnv("KBOS_BYPASS_ADMIN", v);
      expect(isAdminBypassOpen()).toBe(false);
    }
  });

  it('ativo só com "true" (case-insensitive, com espaços)', () => {
    for (const v of ["true", "TRUE", " True "]) {
      vi.stubEnv("KBOS_BYPASS_ADMIN", v);
      expect(isAdminBypassOpen()).toBe(true);
    }
  });
});
