import { VideoStatus, type VideoResponse } from "@playwithpro/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import messages from "../../messages/en.json";
import { ClipPicker } from "@/components/sessions/clip-picker";
import { clipSetErrorMessage } from "@/lib/clip-set";

const video = (id: string, title: string, durationSeconds: number) =>
  ({
    id,
    title,
    status: VideoStatus.Ready,
    sizeBytes: 1024,
    durationSeconds,
    width: 1920,
    height: 1080,
    fps: 60,
    codec: "h264",
    rejectionReason: null,
    expiresAt: null,
    attachedUpcomingSessions: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
  }) satisfies VideoResponse;

const VIDEOS = [
  video("v1", "Match", 20 * 60),
  video("v2", "Serve", 5 * 60),
  video("v3", "Loop", 10 * 60),
];
const CAPS = { maxClips: 2, maxTotalSeconds: 30 * 60 };

function Harness({ videos = VIDEOS, caps = CAPS }) {
  const [value, setValue] = useState<
    { videoId: string; note?: string | null }[]
  >([]);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ClipPicker
        videos={videos}
        caps={caps}
        value={value}
        onChange={setValue}
      />
      <pre data-testid="value">{JSON.stringify(value)}</pre>
    </NextIntlClientProvider>
  );
}

const currentValue = () =>
  JSON.parse(screen.getByTestId("value").textContent ?? "[]") as {
    videoId: string;
    note?: string | null;
  }[];

describe("ClipPicker", () => {
  it("selects clips in order, shows the meter, and enforces the count cap", () => {
    render(<Harness />);
    expect(screen.getByRole("status")).toHaveTextContent("0 of 2 clips");
    expect(screen.getByRole("status")).toHaveTextContent("0:00 of 30:00");

    fireEvent.click(screen.getByRole("checkbox", { name: "Serve" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Match" }));
    expect(currentValue().map((c) => c.videoId)).toEqual(["v2", "v1"]);
    expect(screen.getByRole("status")).toHaveTextContent("2 of 2 clips");
    expect(screen.getByRole("status")).toHaveTextContent("25:00 of 30:00");

    // The third checkbox is disabled at the cap, with the cap explained.
    expect(screen.getByRole("checkbox", { name: "Loop" })).toBeDisabled();
    expect(screen.getByText(/at most 2 clips/i)).toBeInTheDocument();
  });

  it("reorders with the move buttons and records notes", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Serve" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Match" }));
    fireEvent.click(screen.getByRole("button", { name: "Move Match up" }));
    expect(currentValue().map((c) => c.videoId)).toEqual(["v1", "v2"]);
    expect(
      screen.getByRole("button", { name: "Move Match up" }),
    ).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Note for Serve" }), {
      target: { value: "second serve" },
    });
    expect(currentValue()).toEqual([
      { videoId: "v1", note: null },
      { videoId: "v2", note: "second serve" },
    ]);
  });

  it("flags a set over the duration cap", () => {
    render(<Harness caps={{ maxClips: 5, maxTotalSeconds: 15 * 60 }} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Match" }));
    expect(screen.getByRole("status")).toHaveTextContent("20:00 of 15:00");
    expect(
      screen.getByText(/at most 15:00; yours total 20:00/i),
    ).toBeInTheDocument();
  });

  it("links to the upload flow when the library has no ready videos", () => {
    render(<Harness videos={[]} />);
    expect(
      screen.getByRole("link", { name: /upload a video/i }),
    ).toHaveAttribute(
      "href",
      expect.stringContaining("/dashboard/videos/upload"),
    );
  });
});

describe("clipSetErrorMessage", () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    `${key}${values ? ` ${JSON.stringify(values)}` : ""}`;

  it("localizes the API rejection with its numbers", () => {
    expect(
      clipSetErrorMessage(
        t,
        { reason: "too_many_clips", max: 5, count: 6 },
        "x",
      ),
    ).toBe('errors.too_many_clips {"max":5,"count":6}');
    expect(
      clipSetErrorMessage(
        t,
        { reason: "too_long", maxSeconds: 3600, totalSeconds: 3900 },
        "x",
      ),
    ).toBe('errors.too_long {"max":"1:00:00","total":"1:05:00"}');
    expect(clipSetErrorMessage(t, { reason: "duplicate" }, "x")).toBe(
      "errors.duplicate",
    );
    expect(clipSetErrorMessage(t, { message: "nope" }, "fallback")).toBe(
      "fallback",
    );
  });
});
