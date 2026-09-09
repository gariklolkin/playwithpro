/** Shared 16:10 black frame so every call phase keeps the same footprint. */
export function CallFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-card border border-border bg-black">
      {children}
    </div>
  );
}
