"use client";
import { useEffect, useState } from "react";

/** Cabeçalho do link: para qual empresa é e até quando vale. */
export default function ConnectHeader({ token }: { token: string }) {
  const [info, setInfo] = useState<{ project?: string; expiresAt?: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/public/social-connect/${token}/`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).then((j) => { if (alive) setInfo(j); }).catch(() => { if (alive) setInfo({}); });
    return () => { alive = false; };
  }, [token]);
  return (
    <header className="flex flex-col gap-2">
      <p className="kb-faint text-[11px] uppercase tracking-[0.32em]">Conexão segura</p>
      <h1 className="font-display text-3xl leading-tight sm:text-4xl">
        {info?.project ? <>Conecte as redes da <span className="bg-gradient-to-r from-[#EDE6EC] via-[#b9a2ff] to-[#E80EFD] bg-clip-text text-transparent">{info.project}</span></> : "Conecte suas redes sociais"}
      </h1>
      {info?.expiresAt && <p className="kb-muted text-sm">Este link vale até {new Date(info.expiresAt).toLocaleDateString("pt-BR")}. Toque na rede, entre com a sua conta no site oficial dela e autorize o KBOS.</p>}
    </header>
  );
}
