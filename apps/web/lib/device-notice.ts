/** What the in-call device notice should say, derived from live track state. */
export type DeviceNotice = "camera" | "microphone" | "both" | null;

/**
 * The notice reflects what the party asked for on pre-join against what is
 * actually published now. A device error alone is not enough: LiveKit raises
 * one for a cancelled screen-share picker or a camera that was momentarily
 * busy while the pre-join preview released it, and both recover on their
 * own. It also goes away the moment the missing device publishes.
 */
export function deviceNotice(input: {
  deviceError: boolean;
  wantsCamera: boolean;
  wantsMicrophone: boolean;
  cameraOn: boolean;
  microphoneOn: boolean;
}): DeviceNotice {
  if (!input.deviceError) return null;
  const camera = input.wantsCamera && !input.cameraOn;
  const microphone = input.wantsMicrophone && !input.microphoneOn;
  if (camera && microphone) return "both";
  if (camera) return "camera";
  if (microphone) return "microphone";
  return null;
}
