/** Side length of the normalized square avatar we upload. */
export const AVATAR_EXPORT_SIZE = 512;

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CroppedAvatar {
  blob: Blob;
  contentType: "image/webp" | "image/jpeg";
}

/**
 * Decodes a picked file into an object URL the crop UI can render.
 * Throws when the browser cannot decode the file as an image.
 */
export function loadImageUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => resolve(url);
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("undecodable image"));
    };
    probe.src = url;
  });
}

/**
 * Draws the selected area onto a fixed-size square canvas and encodes it.
 * Re-encoding bakes in EXIF orientation (the browser already applied it when
 * decoding) and strips all metadata, including GPS. WebP is preferred; JPEG
 * is the fallback for browsers whose canvas cannot encode WebP.
 */
export async function cropToAvatar(
  imageUrl: string,
  crop: PixelCrop,
): Promise<CroppedAvatar> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("undecodable image"));
    el.src = imageUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_EXPORT_SIZE;
  canvas.height = AVATAR_EXPORT_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas 2d context unavailable");
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    AVATAR_EXPORT_SIZE,
    AVATAR_EXPORT_SIZE,
  );

  const toBlob = (type: string, quality: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

  const webp = await toBlob("image/webp", 0.85);
  // Browsers that cannot encode WebP return null or silently fall back to PNG.
  if (webp && webp.type === "image/webp") {
    return { blob: webp, contentType: "image/webp" };
  }
  const jpeg = await toBlob("image/jpeg", 0.85);
  if (!jpeg) {
    throw new Error("canvas encoding failed");
  }
  return { blob: jpeg, contentType: "image/jpeg" };
}
