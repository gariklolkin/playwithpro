import { describe, expect, it } from "vitest";
import { deviceNotice } from "@/lib/device-notice";

const base = {
  deviceError: true,
  wantsCamera: true,
  wantsMicrophone: true,
  cameraOn: true,
  microphoneOn: true,
};

describe("deviceNotice", () => {
  it("stays silent without a device error", () => {
    expect(
      deviceNotice({ ...base, deviceError: false, cameraOn: false }),
    ).toBeNull();
  });

  it("clears once everything requested is published (cancelled screen share, transient join failure)", () => {
    expect(deviceNotice(base)).toBeNull();
  });

  it("names the device that is actually missing", () => {
    expect(deviceNotice({ ...base, cameraOn: false })).toBe("camera");
    expect(deviceNotice({ ...base, microphoneOn: false })).toBe("microphone");
    expect(
      deviceNotice({ ...base, cameraOn: false, microphoneOn: false }),
    ).toBe("both");
  });

  it("ignores devices the party turned off on pre-join", () => {
    expect(
      deviceNotice({ ...base, wantsCamera: false, cameraOn: false }),
    ).toBeNull();
  });
});
