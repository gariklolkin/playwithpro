import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_EXPORT_SIZE,
  cropToAvatar,
  loadImageUrl,
} from "@/lib/crop-image";

/** jsdom has no real decoder/encoder: stub Image and canvas. */
function stubImage(behavior: "load" | "error") {
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() =>
          behavior === "load" ? this.onload?.() : this.onerror?.(),
        );
      }
    },
  );
}

function stubCanvas(blobsByType: Record<string, Blob | null>) {
  const drawImage = vi.fn();
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") throw new Error(`unexpected createElement ${tag}`);
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage, imageSmoothingQuality: "low" }),
      toBlob: (callback: (blob: Blob | null) => void, type: string) =>
        callback(blobsByType[type] ?? null),
    } as unknown as HTMLCanvasElement;
  });
  return { drawImage };
}

const CROP = { x: 10, y: 20, width: 300, height: 300 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadImageUrl", () => {
  it("resolves an object URL for a decodable image", async () => {
    stubImage("load");
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:ok"),
      revokeObjectURL: vi.fn(),
    });

    await expect(
      loadImageUrl(new File(["x"], "a.png", { type: "image/png" })),
    ).resolves.toBe("blob:ok");
  });

  it("rejects and revokes the URL for an undecodable file", async () => {
    stubImage("error");
    const revoke = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:bad"),
      revokeObjectURL: revoke,
    });

    await expect(
      loadImageUrl(new File(["x"], "a.zip", { type: "application/zip" })),
    ).rejects.toThrow();
    expect(revoke).toHaveBeenCalledWith("blob:bad");
  });
});

describe("cropToAvatar", () => {
  it("exports the selected area as a 512×512 WebP", async () => {
    stubImage("load");
    const webp = new Blob(["webp"], { type: "image/webp" });
    const { drawImage } = stubCanvas({ "image/webp": webp });

    const result = await cropToAvatar("blob:ok", CROP);

    expect(result.contentType).toBe("image/webp");
    expect(result.blob).toBe(webp);
    // source rect from the crop, destination always the normalized square
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      CROP.x,
      CROP.y,
      CROP.width,
      CROP.height,
      0,
      0,
      AVATAR_EXPORT_SIZE,
      AVATAR_EXPORT_SIZE,
    );
  });

  it("falls back to JPEG when the browser cannot encode WebP", async () => {
    stubImage("load");
    const jpeg = new Blob(["jpeg"], { type: "image/jpeg" });
    // Safari-style: toBlob("image/webp") silently produces a PNG
    stubCanvas({
      "image/webp": new Blob(["png"], { type: "image/png" }),
      "image/jpeg": jpeg,
    });

    const result = await cropToAvatar("blob:ok", CROP);

    expect(result.contentType).toBe("image/jpeg");
    expect(result.blob).toBe(jpeg);
  });

  it("throws when no encoder produces a blob", async () => {
    stubImage("load");
    stubCanvas({});

    await expect(cropToAvatar("blob:ok", CROP)).rejects.toThrow(
      "canvas encoding failed",
    );
  });
});
