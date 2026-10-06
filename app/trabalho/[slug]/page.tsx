import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PROJECTS, getProject, WHATSAPP } from "@/lib/data";
import SingleAnim from "./SingleAnim";
import VideoEmbed from "./VideoEmbed";

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return params.then(({ slug }) => {
    const p = getProject(slug);
    return {
      title: p ? `${p.title} — Kayque Brito` : "Projeto — Kayque Brito",
      description: p?.description ?? "",
    };
  });
}

const SERVICE_LABEL: Record<string, string> = {
  audiovisual: "Audiovisual",
  dev: "Desenvolvimento",
  branding: "Branding",
};

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const idx = PROJECTS.findIndex((p) => p.slug === slug);
  const others = PROJECTS.filter((p) => p.slug !== slug && p.service === project.service)
    .concat(PROJECTS.filter((p) => p.slug !== slug && p.service !== project.service))
    .slice(0, 3);
  const next = PROJECTS[(idx + 1) % PROJECTS.length];

  return (
    <main className="bg-[#0B0B1E] text-[#F4F1EC]">
      <SingleAnim />

      {/* HERO */}
      <div className="single-hero-glow px-5 pt-24 sm:px-8 md:px-14 md:pt-36">
        <div className="mx-auto max-w-[1280px]">
          <div className="anim-in flex items-center justify-between gap-4">
            <Link
              href="/trabalho"
              className="text-[11px] uppercase tracking-[0.3em] text-white/45 transition hover:text-white"
            >
              ← Todos trabalhos
            </Link>
            <span className="rounded-full border border-white/15 bg-white/[0.03] px-4 py-1.5 text-[10px] uppercase tracking-[0.28em] text-white/60 backdrop-blur">
              {SERVICE_LABEL[project.service] ?? project.category}
            </span>
          </div>

          <p className="anim-in mt-8 text-[11px] uppercase tracking-[0.32em] text-white/45 md:mt-10">
            {String(idx + 1).padStart(2, "0")} / {String(PROJECTS.length).padStart(2, "0")} — {project.category}
          </p>
          <h1
            className="anim-in font-display mt-3 max-w-5xl font-light leading-[0.95] text-white"
            style={{ fontSize: "clamp(44px, 11vw, 110px)", letterSpacing: "-0.03em" }}
          >
            {project.title}
          </h1>
          <p className="anim-in mt-5 max-w-2xl text-[15px] font-light leading-relaxed text-white/65 md:text-lg">
            {project.description}
          </p>
          {project.siteUrl && (
            <a
              href={project.siteUrl}
              target="_blank"
              rel="noopener"
              className="anim-in mt-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.03] px-6 py-3 text-[12px] font-medium uppercase tracking-[0.2em] text-white backdrop-blur transition hover:border-white/60 hover:bg-white hover:text-black"
            >
              Visitar site <span aria-hidden>↗</span>
            </a>
          )}

          {/* meta */}
          <div className="anim-in mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:mt-10 md:grid-cols-4">
            {[
              { k: "Cliente", v: project.client },
              { k: "Ano", v: project.year },
              { k: "Área", v: project.category },
              { k: "Entrega", v: project.videoLabel },
            ].map((m) => (
              <div key={m.k} className="bg-[#0B0B1E] px-5 py-4 md:px-6 md:py-5">
                <p className="text-[10px] uppercase tracking-[0.28em] text-white/35">{m.k}</p>
                <p className="mt-1.5 break-words text-[14px] font-medium leading-snug text-white md:truncate md:text-[15px]" title={m.v}>
                  {m.v}
                </p>
              </div>
            ))}
          </div>

          {/* vídeo real (YouTube) ou capa estática quando não há vídeo */}
          {project.videoId ? (
            <VideoEmbed
              videoId={project.videoId}
              start={project.videoStart}
              title={project.title}
              poster={project.img}
              label={project.videoLabel}
            />
          ) : (
            <div className="anim-in group relative mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#131316] md:mt-8 md:rounded-3xl">
              <Image
                src={project.img}
                alt={project.title}
                width={1400}
                height={800}
                priority
                className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-[1.02] sm:aspect-[16/9]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-black/55 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/85 backdrop-blur md:bottom-5 md:left-5 md:text-[11px]">
                {project.videoLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-5 sm:px-8 md:px-14">
        {/* sobre o projeto */}
        <div className="mt-12 grid gap-8 md:mt-20 md:grid-cols-[0.9fr_1.1fr] md:gap-10">
          <div>
            <p className="anim-in text-[11px] uppercase tracking-[0.32em] text-white/40">
              O projeto
            </p>
            <h2 className="anim-in font-display mt-3 text-3xl font-light leading-tight md:text-4xl">
              Sobre o
              <br />
              projeto
            </h2>
            <div className="anim-in mt-6 hidden h-px w-24 bg-white/25 md:block" aria-hidden />
          </div>
          <div className="space-y-5 text-[15px] font-light leading-relaxed text-white/65 md:text-base">
            <p className="anim-in font-display text-xl font-light leading-relaxed text-white md:text-2xl">
              {project.longDescription}
            </p>
            {project.about.map((t) => (
              <p key={t.slice(0, 24)} className="anim-in">
                {t}
              </p>
            ))}
          </div>
        </div>

        {/* galeria editorial */}
        <div className="mt-12 md:mt-20">
          <div className="anim-in flex items-end justify-between">
            <h2 className="font-display text-2xl font-light md:text-3xl">Galeria</h2>
            <span className="text-[11px] uppercase tracking-[0.28em] text-white/35">
              {project.gallery.length} {project.gallery.length === 1 ? "peça" : "peças"}
            </span>
          </div>
          <div className="mt-6 grid gap-4 md:gap-5">
            {project.gallery.map((g, i) => (
              <div
                key={g + i}
                className={`anim-in work-card overflow-hidden rounded-2xl border border-white/10 bg-[#131316] ${
                  i === 0 ? "" : "md:grid md:grid-cols-2 md:gap-5 md:border-0 md:bg-transparent"
                }`}
              >
                {i === 0 ? (
                  <Image
                    src={g}
                    alt={`${project.title} — ${i + 1}`}
                    width={1400}
                    height={800}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition duration-700 hover:scale-[1.02] sm:aspect-[21/9]"
                  />
                ) : (
                  <>
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#131316]">
                      <Image
                        src={g}
                        alt={`${project.title} — ${i + 1}`}
                        width={1200}
                        height={800}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover transition duration-700 hover:scale-[1.03]"
                      />
                    </div>
                    <div className="hidden flex-col justify-center rounded-2xl border border-white/10 bg-white/[0.02] p-8 backdrop-blur md:flex">
                      <p className="text-[11px] uppercase tracking-[0.3em] text-white/35">
                        Detalhe — {String(i + 1).padStart(2, "0")}
                      </p>
                      <p className="font-display mt-3 text-xl font-light leading-snug text-white/85">
                        {project.about[i % project.about.length] ?? project.description}
                      </p>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="anim-in relative mt-12 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-12 text-center backdrop-blur md:mt-20 md:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 80% at 50% 100%, rgba(157,184,232,0.18), transparent 70%)",
            }}
          />
          <p className="relative text-[11px] uppercase tracking-[0.32em] text-white/40">
            Próximo passo
          </p>
          <h3 className="font-display relative mx-auto mt-4 max-w-2xl text-balance text-3xl font-light leading-tight md:text-5xl">
            Vamos criar algo <em className="italic text-[#9DB8E8]">incrível</em> juntos?
          </h3>
          <a
            href={WHATSAPP}
            target="_blank"
            className="relative mt-8 inline-block rounded-full bg-white px-10 py-4 text-sm font-bold uppercase tracking-[0.18em] text-black transition hover:scale-[1.03] md:px-12"
          >
            Iniciar conversa
          </a>
        </div>

        {/* próximo projeto em destaque */}
        <Link
          href={`/trabalho/${next.slug}`}
          className="anim-in group relative mt-8 block overflow-hidden rounded-3xl border border-white/10 md:mt-10"
        >
          <div className="relative aspect-[16/10] sm:aspect-[21/9]">
            <Image
              src={next.img}
              alt={next.title}
              fill
              loading="lazy"
              className="object-cover transition duration-700 group-hover:scale-[1.03]"
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-black/55 transition group-hover:bg-black/45" />
            <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <p className="text-[11px] uppercase tracking-[0.32em] text-white/60">
                Próximo projeto →
              </p>
              <p
                className="font-display mt-3 font-light text-white"
                style={{ fontSize: "clamp(32px, 8vw, 64px)", letterSpacing: "-0.02em" }}
              >
                {next.title}
              </p>
            </div>
          </div>
        </Link>

        {/* outros */}
        <h2 className="anim-in font-display mt-12 text-2xl font-light md:mt-16">Próximos projetos</h2>
        <div className="anim-in -mx-5 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-20 scrollbar-none md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-24">
          {others.map((o) => (
            <Link
              key={o.slug}
              href={`/trabalho/${o.slug}`}
              className="work-card group w-[78vw] shrink-0 snap-center overflow-hidden rounded-2xl border border-white/10 bg-[#131316] transition hover:border-white/25 sm:w-[52vw] md:w-auto"
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src={o.img}
                  alt={o.title}
                  fill
                  loading="lazy"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              </div>
              <div className="p-5">
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/45">
                  {o.category}
                </p>
                <p className="font-display mt-1 text-lg font-bold">{o.title}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
