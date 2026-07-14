import { SUPPORTED_LOCALES } from "@playwithpro/shared";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  ru: "Русский",
  zh: "中文",
};

const TRUST_ITEMS = [
  { emoji: "✅", label: "Verified pros only" },
  { emoji: "🔒", label: "Payment held in escrow" },
  { emoji: "🎥", label: "Video calls, no account needed" },
  { emoji: "🌍", label: "5 languages" },
];

const STEPS = [
  {
    emoji: "📹",
    title: "1. Upload your video",
    body: "Record a match or training drill and upload it. The coach reviews it before your call.",
  },
  {
    emoji: "🗓️",
    title: "2. Pick a coach & time",
    body: "Filter verified pros by language, service and price. Book a free slot — it lands in both calendars with a video link.",
  },
  {
    emoji: "💬",
    title: "3. Meet & improve",
    body: "Join the video call, get your analysis. Your payment is only released to the coach after the session happens.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center bg-bg">
      <section className="w-full max-w-2xl px-5 pt-18 pb-12 text-center">
        <div className="mb-4 text-4xl tracking-widest">🏓 🎯 📹</div>
        <h1 className="mx-auto max-w-xl text-[44px] leading-[1.15] font-bold tracking-[-0.5px] text-text">
          Train with real table tennis professionals
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-lg text-text-secondary">
          Upload your game footage, book a video session with a verified pro,
          and get personal feedback — in your language.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <button className="rounded-[8px] bg-text px-5 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-text/90">
            Find your coach →
          </button>
          <button className="rounded-[8px] border border-border px-5 py-2.5 text-[15px] font-medium text-text transition-colors hover:bg-bg-hover">
            I&apos;m a professional
          </button>
        </div>
      </section>

      <section className="flex w-full max-w-3xl flex-wrap justify-center gap-x-8 gap-y-2 border-y border-border px-5 py-4 text-sm text-text-secondary">
        {TRUST_ITEMS.map((item) => (
          <div key={item.label}>
            {item.emoji}{" "}
            <span className="font-medium text-text">{item.label}</span>
          </div>
        ))}
      </section>

      <section className="grid w-full max-w-3xl grid-cols-1 gap-4 px-5 py-12 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.title}
            className="rounded-card bg-bg-secondary p-6 shadow-card"
          >
            <div className="mb-2.5 text-[28px]">{step.emoji}</div>
            <h3 className="mb-1 font-semibold text-text">{step.title}</h3>
            <p className="text-sm text-text-secondary">{step.body}</p>
          </div>
        ))}
      </section>

      <footer className="pb-10 text-center text-xs text-text-tertiary">
        PlayWithPro ·{" "}
        {SUPPORTED_LOCALES.map(
          (locale) => LOCALE_LABELS[locale] ?? locale,
        ).join(" · ")}
      </footer>
    </main>
  );
}
