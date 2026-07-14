# PlayWithPro — Design System & UX Specification

> Marketplace connecting amateur table tennis players with verified professional players and coaches for paid video consultations.
>
> Interactive mockup: [`design-proposal.html`](./design-proposal.html)

## 1. Brand & Visual Language

Notion-inspired: calm, content-first, generous whitespace, emoji as icons, color used only for meaning (status, tags), never for decoration.

**Working name:** PlayWithPro 🏓 (says exactly what the platform does — amateurs playing/training with pros; kept as a latin brand name in all locales).

### 1.1 Color tokens

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#FFFFFF` | Page background |
| `--bg-secondary` | `#F7F6F3` | Sidebars, subtle cards |
| `--bg-hover` | `#EFEFEE` | Hover states |
| `--text` | `#37352F` | Primary text, primary buttons |
| `--text-secondary` | `#787774` | Secondary text |
| `--text-tertiary` | `#9B9A97` | Captions, meta |
| `--border` | `#EDEDEB` | Dividers, card borders |
| `--accent` | `#2E6BE6` | Links, focus rings (sparingly) |

Tag palette (Notion pastel set): gray, blue, green, yellow, orange, purple, pink, red — each as `bg` + `text` pair (see CSS in mockup). Semantic mapping:

- **Blue** — trust/escrow states: `Verified`, `Paid · in escrow`
- **Green** — success: `Completed · paid out`, availability
- **Yellow** — attention: pending confirmation, disputes open
- **Red** — admin/destructive: rejection, dispute escalation
- **Purple** — service type `Video analysis`
- **Gray** — languages, neutral meta

### 1.2 Typography

System font stack (`ui-sans-serif, -apple-system, "Segoe UI", …`) — like Notion, no webfont cost, great CJK/Cyrillic fallbacks for the 5 locales.

| Style | Size / weight |
|---|---|
| H1 (hero) | 62px / 800, letter-spacing −1.8px |
| H1 (page) | 28px / 700 |
| Section label | 13px / 500, uppercase, tertiary color |
| Body | 15px / 400, line-height 1.5 |
| Caption | 12.5–13px, secondary/tertiary |

### 1.3 Components

- **Cards:** radius 12px, layered soft shadow (`0 0 0 1px` ring + blur), lift on hover.
- **Buttons:** marketing/landing CTAs use a blue pair — primary `#1B5FD9` white text, secondary light-blue `#D3E5EF` with `#1B5FD9` text (Notion-homepage style). Inside the app: primary = ink `#37352F`, ghost = 1px border.
- **Landing hero (Notion-homepage style):** big 62px headline with one keyword highlighted by a pastel pill (`--tag-blue-bg`, round, leading blue dot); blue CTA pair under the subtitle; center illustration — flat SVG table tennis table in corner perspective (blue top, dark side aprons, inset metal legs, low net with dark mesh and white top tape, orange ball on a dashed arc, red paddle); "how it works" cards on pastel tag backgrounds (blue/yellow/green). Landing container is wider (1320px) than app screens (1080px); illustration up to 1140px.
- **Tags:** 4px radius, pastel bg, 12.5px medium.
- **Icons:** emoji everywhere (🏓 📹 🗓️ 💬 🔒 ✅). Zero icon-font dependency, renders natively in all locales. Lucide icons allowed later for system UI (arrows, close).
- **Avatars:** circle, `--bg-secondary` fill with emoji placeholder until photo uploaded.

## 2. Information Architecture

Roles: **Amateur (player)**, **Professional (coach)**, **Admin**.

```
Public:      Landing · Coach catalog · Coach profile · Auth
Amateur:     My sessions · My videos · Payments · Settings
Professional: Overview · Availability · Bookings · Earnings · My profile · Settings
Admin:       Verification queue · Disputes · Users · Transactions · Analytics
```

## 3. Key Screens (see mockup)

1. **Landing** — value prop, 3-step "how it works" (upload video → pick coach & slot → meet & improve), trust strip (verification, escrow, Google Meet, 5 languages).
2. **Coach catalog** — filter sidebar (language, service, price/hour, availability) + coach cards: avatar, verified badge, rating/session count, language & service tags, price-from, next free slot.
3. **Coach profile + booking** — bio, achievements, per-service pricing rows, reviews; sticky booking panel: week slot picker → video upload (drag&drop, up to 2 GB → S3) → order summary with platform fee → escrow notice → pay CTA. Note under CTA: Google Meet invite added to both calendars.
4. **Player dashboard** — post-session confirmation banner (confirm / report a problem, auto-confirm countdown), upcoming sessions with escrow status + Meet chip + calendar chip, past sessions with payout status and notes.
5. **Coach dashboard** — stats (in escrow / paid out / rating), next sessions with client's attached video, weekly availability grid editor (available / booked / off) synced to Google Calendar.
6. **Admin — verification queue** — applicant claims, submitted documents (license, federation profile links, club letters, intro video), approve / reject / request more info.

## 4. Core UX Flows

### 4.1 Booking & escrow

```
Amateur: pick coach → pick service → pick slot → (optional) upload video → pay
Platform: PaymentProvider.hold(amount)            # funds held, not transferred
Platform: create calendar invite for both parties (Google Calendar API or .ics email) + video room link (Meet or Jitsi)
Session:  both join via platform session room at slot time (attendance logged)
After:    amateur confirms (or auto-confirm after 48h, or opens dispute)
Platform: PaymentProvider.release(coach) − platform fee   # payout
```

Session-happened evidence (Meet link click tracking + mutual confirmation + dispute window) is specified in the OpenSpec phase.

### 4.2 Coach onboarding

Sign up → build profile (bio, achievements, languages, services & prices) → submit credentials → **admin review** → verified badge → publish availability → bookable.

### 4.3 Confirmation states (session lifecycle)

`draft → pending_payment → paid_escrow → in_progress → awaiting_confirmation → completed_paid | disputed → resolved`

## 5. Internationalization

- Locales: `en` (default), `fr`, `de`, `ru`, `zh`.
- Language switcher in navbar (globe 🌐 select), locale prefix in URL (`/de/coaches/...`).
- All UI strings externalized (next-intl). Coach-generated content (bio) shown as-is with coach's language tags; UI never auto-translates user content in MVP.
- Times always shown in the viewer's timezone with explicit "(your time)" label; coach side shows their own tz.

## 6. Accessibility & Responsive

- Contrast: ink on white passes AAA; pastel tags pass AA with paired dark text colors.
- All slot/service selectors are real buttons, keyboard-navigable.
- Breakpoints: catalog grid 2→1 col at <900px; dashboard sidebar collapses to top tabs at <768px; booking panel becomes bottom sheet on mobile.

## 7. Tech Stack Context (agreed)

- **Frontend:** React + Next.js (App Router), Tailwind CSS + shadcn/ui, next-intl.
- **Backend:** NestJS + PostgreSQL (Prisma).
- **Sessions:** `VideoProvider` abstraction. Google Meet when the coach has a Google account connected; fallback — embedded Jitsi room (no account required for either party). Join always goes through a platform "session room" page so attendance can be tracked regardless of provider.
- **Calendar:** `CalendarProvider` abstraction. Google Calendar API event for users who connected Google; universal `.ics` email invite for everyone else. Not all users are assumed to have a Google account.
- **Video storage:** S3 (pre-signed uploads); MinIO locally.
- **Payments:** `PaymentProvider` abstraction; mock provider in MVP, real provider (e.g., Stripe Connect) decided later.
- **Local dev:** Tilt (Docker-based dev environment).
