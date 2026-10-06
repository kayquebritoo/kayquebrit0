"use client";
import { useState } from "react";
import Image from "next/image";

/* Vídeo click-to-play: capa leve primeiro, iframe youtube-nocookie só após o toque.
   Rápido no mobile e sem carregar o player de todos os projetos de uma vez. */
export default function VideoEmbed({
  videoId,
  start,
  title,
  poster,
  label,
}: {
  videoId: string;
  start?: number;
  title: string;
  poster: string;
  label: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    const src =
      `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0` +
      (start ? `&start=${start}` : "");
    return (
      <div className="anim-in group relative mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black md:mt-8 md:rounded-3xl">
        <iframe
          src={src}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className="aspect-[4/3] w-full sm:aspect-[16/9]"
        />
      </div>
    );
  }

  return (
    <div className="anim-in group relative mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#131316] md:mt-8 md:rounded-3xl">
      <Image
        src={poster}
        alt={title}
        width={1400}
        height={800}
        priority
        className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-[1.02] sm:aspect-[16/9]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <button
        onClick={() => setPlaying(true)}
        className="absolute inset-0 flex cursor-pointer items-center justify-center"
        aria-label={`Assistir ${title}`}
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-lg text-black shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition duration-300 group-hover:scale-110 md:h-20 md:w-20">
          ▶
        </span>
      </button>
      <span className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-black/55 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/85 backdrop-blur md:bottom-5 md:left-5 md:text-[11px]">
        {label}
      </span>
    </div>
  );
}
