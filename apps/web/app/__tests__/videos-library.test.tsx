import { VideoStatus, type VideoResponse } from "@playwithpro/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../messages/en.json";
import { VideosLibrary } from "@/components/videos/videos-library";

const fetchMock = vi.fn();
const confirmMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", confirmMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const GB = 1024 * 1024 * 1024;
const LIMITS = {
  file: { maxSizeBytes: 2 * GB, maxDurationSeconds: 1800 },
  session: { maxClips: 5, maxTotalSeconds: 3600 },
  library: { maxBytes: 10 * GB, maxVideos: 20, usedBytes: 3 * GB, count: 2 },
};

const base: VideoResponse = {
  id: "v1",
  title: "Match",
  status: VideoStatus.Ready,
  sizeBytes: 2 * GB,
  durationSeconds: 600,
  width: 1920,
  height: 1080,
  fps: 60,
  codec: "h264",
  rejectionReason: null,
  expiresAt: null,
  attachedUpcomingSessions: 0,
  createdAt: "2026-09-01T00:00:00.000Z",
};

function renderLibrary(videos: VideoResponse[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VideosLibrary initialVideos={videos} initialLimits={LIMITS} />
    </NextIntlClientProvider>,
  );
}

describe("VideosLibrary limits", () => {
  it("shows the quota bar, the per-file and per-session caps, and the expiry", () => {
    renderLibrary([
      { ...base, expiresAt: "2026-12-01T00:00:00.000Z" },
      { ...base, id: "v2", title: "Serve", attachedUpcomingSessions: 1 },
    ]);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "30",
    );
    expect(
      screen.getByText("3 GB of 10 GB · 2 of 20 videos"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Up to 2 GB and 30:00 per file · Up to 5 clips and 1:00:00/,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Deleted on .*unless attached/)).toHaveLength(1);
  });

  it("warns about attached upcoming sessions before deleting", () => {
    confirmMock.mockReturnValue(false);
    renderLibrary([{ ...base, attachedUpcomingSessions: 2 }]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringContaining("attached to 2 upcoming sessions"),
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/videos/v1"),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
