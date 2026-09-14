/** Titled section card used by the settings panels. */
export function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card bg-bg p-6 shadow-card">
      <h2 className="mb-4 text-[13px] font-medium uppercase tracking-[0.5px] text-text-tertiary">
        {title}
      </h2>
      {children}
    </section>
  );
}
