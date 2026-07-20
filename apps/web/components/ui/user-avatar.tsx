const SIZE_CLASSES = {
  sm: "h-8 w-8 text-sm",
  lg: "h-20 w-20 text-2xl",
} as const;

/** Avatar image with an initials fallback when no avatar is set. */
export function UserAvatar({
  displayName,
  avatarUrl,
  size = "sm",
}: {
  displayName: string;
  avatarUrl: string | null;
  size?: keyof typeof SIZE_CLASSES;
}) {
  const sizeClass = SIZE_CLASSES[size];
  if (avatarUrl) {
    return (
      // Avatars come from S3/MinIO whose host varies per env; next/image
      // needs a static remotePatterns allowlist and buys nothing for tiny
      // images.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={displayName}
        className={`${sizeClass} rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${sizeClass} flex items-center justify-center rounded-full bg-bg-secondary font-semibold text-text`}
    >
      {displayName.trim().charAt(0).toUpperCase() || "🏓"}
    </span>
  );
}
