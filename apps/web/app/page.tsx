import Image from "next/image";
import { SUPPORTED_LOCALES } from "@playwithpro/shared";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  ru: "Русский",
  zh: "中文",
};

const STEPS = [
  {
    bg: "#D3E5EF",
    emoji: "📹",
    title: "1. Upload your video",
    body: "Record a match or training drill and upload it. The coach reviews it before your call.",
  },
  {
    bg: "#FDECC8",
    emoji: "🗓️",
    title: "2. Pick a coach & time",
    body: "Filter verified pros by language, service and price. Book a free slot — it lands in both calendars with a video link.",
  },
  {
    bg: "#DBEDDB",
    emoji: "💬",
    title: "3. Meet & improve",
    body: "Join the video call, get your analysis. Your payment is only released to the coach after the session happens.",
  },
];

function Navbar() {
  return (
    <nav className="flex w-full items-center gap-5 border-b border-border px-8 py-3">
      <div className="flex items-center gap-2 text-[17px] font-bold text-text">
        🏓 PlayWithPro
      </div>
      <div className="ml-3 hidden gap-1 sm:flex">
        {["Find a coach", "How it works", "For coaches"].map((label) => (
          <a
            key={label}
            href="#"
            className="rounded-md px-2.5 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
          >
            {label}
          </a>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <select
          aria-label="Language"
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-[13px] text-text-secondary"
        >
          <option>🌐 EN</option>
          <option>FR</option>
          <option>DE</option>
          <option>RU</option>
          <option>中文</option>
        </select>
        <button className="hidden rounded-md border border-[#D3D1CB] px-3.5 py-1.5 text-sm font-medium text-text transition-colors hover:bg-bg-hover sm:block">
          Log in
        </button>
        <button className="rounded-md bg-[#2E7DE1] px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#2569C3]">
          Get started
        </button>
      </div>
    </nav>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center bg-bg">
      <Navbar />

      <div className="w-full max-w-[1320px] px-5 sm:px-8">
        {/* Hero */}
        <section className="pt-14 pb-6 text-center">
          <h1 className="mx-auto max-w-[880px] text-[40px] font-extrabold leading-[1.06] tracking-[-1px] text-text sm:text-[62px] sm:tracking-[-1.8px]">
            Where amateurs and{" "}
            <span className="inline-block rounded-full bg-[#D3E5EF] px-[18px] pb-1 leading-[1.05]">
              <span className="mr-2 inline-block h-3.5 w-3.5 translate-y-px rounded-full bg-[#2383E2] align-middle" />
              pros
            </span>{" "}
            play together.
          </h1>
          <p className="mx-auto mt-4 max-w-[620px] text-lg text-text-secondary sm:text-xl">
            Upload your game footage, book a video session with a verified pro,
            and get personal feedback — in your language.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button className="rounded-lg bg-[#2E7DE1] px-[22px] py-[11px] text-[15px] font-semibold text-white transition-colors hover:bg-[#2569C3]">
              Find your coach →
            </button>
            <button className="rounded-lg bg-[#EAF2FD] px-[22px] py-[11px] text-[15px] font-semibold text-[#2A5FC7] transition-colors hover:bg-[#DCEAFB]">
              I&apos;m a professional
            </button>
          </div>

          {/* Illustration — white-background artwork blends into the page (per design mockup) */}
          <div className="mx-auto mt-10 max-w-[900px]">
            <Image
              src="/hero-players.jpg"
              alt="An amateur and a professional in a table tennis rally"
              width={1400}
              height={933}
              priority
              className="h-auto w-full rounded-[20px] border border-border shadow-[0_4px_16px_rgba(15,15,15,0.06)]"
            />
          </div>
        </section>

        {/* Trust strip */}
        <section className="mx-auto max-w-[1200px]">
          <div className="flex flex-wrap justify-center gap-x-12 gap-y-2 border-y border-border py-5 text-sm text-text-secondary">
            <div>
              ✅ <b className="font-semibold text-text">Verified</b> pros only
            </div>
            <div>
              🔒 Payment held in{" "}
              <b className="font-semibold text-text">escrow</b>
            </div>
            <div>
              🎥 Video calls,{" "}
              <b className="font-semibold text-text">no account needed</b>
            </div>
            <div>
              🌍 <b className="font-semibold text-text">5</b> languages
            </div>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto grid max-w-[1200px] grid-cols-1 gap-4 py-10 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.title}
              className="rounded-card p-6"
              style={{ background: step.bg }}
            >
              <div className="mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-white text-2xl shadow-[0_1px_3px_rgba(15,15,15,0.1)]">
                {step.emoji}
              </div>
              <h3 className="mb-1.5 text-base font-semibold text-text">
                {step.title}
              </h3>
              <p className="text-sm text-text-secondary">{step.body}</p>
            </div>
          ))}
        </section>
      </div>

      <footer className="pb-12 text-center text-[13px] text-text-tertiary">
        PlayWithPro ·{" "}
        {SUPPORTED_LOCALES.map(
          (locale) => LOCALE_LABELS[locale] ?? locale,
        ).join(" · ")}
      </footer>
    </main>
  );
}
