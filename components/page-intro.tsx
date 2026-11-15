/** The eyebrow, h1 and subcopy at the top of every member screen (D2 to D4). */
export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children: string }) {
  return (
    <div className="pt-10">
      <p className="font-mono text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">{eyebrow}</p>
      <h1 className="mt-2.5 font-heading text-[clamp(38px,4.6vw,56px)] leading-none font-extrabold tracking-[-0.02em]">
        {title}
      </h1>
      <p className="mt-3 max-w-[60ch] text-[17px] leading-[1.55] text-ink-soft">{children}</p>
    </div>
  );
}

/** The 1280px column every member screen sits in. */
export function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1280px] px-[clamp(16px,4vw,48px)] pb-6">{children}</div>;
}
