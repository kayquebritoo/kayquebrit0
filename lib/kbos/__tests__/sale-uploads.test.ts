import { describe, expect, it } from "vitest";
import { readUploadForm, validateUpload } from "../sale-uploads";
import { MAX_UPLOAD_BYTES } from "../sale-file-types";

describe("validação de arquivos", () => {
  it("aceita documentos, apresentações e imagens sem confiar no MIME do navegador", () => {
    expect(validateUpload("manual.pdf", Buffer.from("%PDF-1.4\n" )).mime).toBe("application/pdf");
    expect(validateUpload("apresentacao.ppt", Buffer.from("d0cf11e0a1b11ae100", "hex")).mime).toBe("application/vnd.ms-powerpoint");
    expect(validateUpload("manual.docx", Buffer.from("PK\x03\x04arquivo" )).mime).toContain("wordprocessingml");
    expect(validateUpload("apresentacao.pptx", Buffer.from("PK\x03\x04arquivo" )).mime).toContain("presentationml");
    expect(validateUpload("marca.png", Buffer.from("89504e470d0a1a0a00", "hex")).mime).toBe("image/png");
    expect(validateUpload("foto.jpeg", Buffer.from("ffd8ffe000", "hex")).mime).toBe("image/jpeg");
  });
  it("rejeita executáveis disfarçados, arquivos vazios e acima do limite", () => {
    expect(() => validateUpload("manual.pdf", Buffer.from("MZexecutavel"))).toThrow("não corresponde");
    expect(() => validateUpload("arquivo.exe", Buffer.from("MZ"))).toThrow("Formato não aceito");
    expect(() => validateUpload("manual.pdf", Buffer.alloc(0))).toThrow("10 MB");
    expect(() => validateUpload("manual.pdf", Buffer.alloc(MAX_UPLOAD_BYTES + 1))).toThrow("10 MB");
  });
  it("limita o corpo da requisição mesmo sem Content-Length", async () => {
    await expect(readUploadForm(new Request("http://localhost/upload", { method: "POST", body: Buffer.alloc(MAX_UPLOAD_BYTES + 65537) }))).rejects.toThrow("10 MB");
    const form = new FormData(); form.set("file", new Blob(["%PDF-1.4\n"]), "manual.pdf");
    const parsed = await readUploadForm(new Request("http://localhost/upload", { method: "POST", body: form }));
    expect((parsed.get("file") as File).name).toBe("manual.pdf");
  });
});
