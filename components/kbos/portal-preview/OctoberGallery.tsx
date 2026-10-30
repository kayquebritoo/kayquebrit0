"use client";
import { useMemo, useState } from "react";
import octoberData from "./october-gallery.json";

export type OctoberPhoto = {
  id: string;
  n: string; // name
  c: "ambiente" | "comida" | "clientes"; // category
  s: string; // subcategory
};

const CATEGORIES = [
  { id: "all", label: "Todas" },
  { id: "clientes", label: "Clientes & Hóspedes" },
  { id: "comida", label: "Comida & Drinks" },
  { id: "ambiente", label: "Ambiente & Hotel" },
] as const;

export default function OctoberGallery({ say }: { say: (m: string) => void }) {
  const [cat, setCat] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [activePhoto, setActivePhoto] = useState<OctoberPhoto | null>(null);
  const perPage = 24;

  const photos = octoberData as OctoberPhoto[];

  const counts = useMemo(() => {
    const c = { all: photos.length, clientes: 0, comida: 0, ambiente: 0 };
    for (const p of photos) {
      if (p.c in c) c[p.c]++;
    }
    return c;
  }, [photos]);

  const filtered = useMemo(() => {
    if (cat === "all") return photos;
    return photos.filter((p) => p.c === cat);
  }, [photos, cat]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const currentBatch = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page]);

  const switchCat = (newCat: string) => {
    setCat(newCat);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Filtros */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="kb-seg flex flex-wrap" role="group" aria-label="Filtrar fotos de outubro">
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-pressed={cat === category.id}
              onClick={() => switchCat(category.id)}
              className="px-3 text-xs sm:text-sm"
            >
              {category.label} ({counts[category.id as keyof typeof counts]})
            </button>
          ))}
        </div>
        <a
          href="https://drive.google.com/drive/folders/1auCUaNQkNZy186MMGhup-wB8kNkfZtyS?usp=sharing"
          target="_blank"
          rel="noopener noreferrer"
          className="kb-btn-ghost min-h-10 text-xs sm:text-sm"
        >
          Abrir pasta no Drive ↗
        </a>
      </div>

      {/* Grade de Fotos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {currentBatch.map((p) => (
          <div
            key={p.id}
            onClick={() => setActivePhoto(p)}
            className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-[#171527] transition-all hover:border-white/30 hover:shadow-lg active:scale-[.98]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://drive.google.com/thumbnail?id=${p.id}&sz=w400`}
              alt={p.n}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2 text-left">
              <span className="block truncate text-[11px] font-medium text-white/90">{p.n}</span>
              <span className="block truncate text-[10px] text-white/60">{p.s}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-4 text-xs sm:text-sm">
          <span className="kb-faint">
            Página {page} de {totalPages} ({filtered.length} fotos)
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="kb-btn-ghost min-h-10 px-3"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <button
              type="button"
              className="kb-btn-ghost min-h-10 px-3"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {/* Modal de Detalhe / Zoom */}
      {activePhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md"
          onClick={() => setActivePhoto(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#171527] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <div>
                <h3 className="font-display text-base font-semibold">{activePhoto.n}</h3>
                <p className="kb-faint text-xs">{activePhoto.s}</p>
              </div>
              <button
                type="button"
                className="kb-btn-ghost min-h-9 px-3 text-xs"
                onClick={() => setActivePhoto(null)}
              >
                ✕ Fechar
              </button>
            </div>
            <div className="relative flex max-h-[65vh] min-h-[280px] items-center justify-center bg-black/40 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://drive.google.com/thumbnail?id=${activePhoto.id}&sz=w1200`}
                alt={activePhoto.n}
                className="max-h-[62vh] w-auto max-w-full rounded-xl object-contain shadow-md"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#11101E] px-5 py-3 text-xs sm:text-sm">
              <span className="kb-faint">Outubro de 2026 · Tratamento LDP Design</span>
              <div className="flex gap-2">
                <a
                  href={`https://drive.google.com/file/d/${activePhoto.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kb-btn-ghost min-h-10 px-4"
                >
                  Abrir no Drive ↗
                </a>
                <a
                  href={`https://drive.google.com/uc?export=download&id=${activePhoto.id}`}
                  download={activePhoto.n}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kb-btn min-h-10 px-4"
                  onClick={() => say(`Iniciando download de ${activePhoto.n}`)}
                >
                  Baixar Alta Resolução
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
