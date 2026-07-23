import type { RoomDescriptor } from '@playwithpro/shared';

/**
 * Port for the video-call integration behind session rooms. Business logic
 * depends only on this interface; the vendor (embedded Jitsi in MVP, Google
 * Meet candidate later) is an implementation detail.
 */
export interface RoomInput {
  /** Random capability slug minted at payment; the only room identity. */
  roomSlug: string;
}

export interface VideoProvider {
  /** Descriptor the web client uses to join; must not leak beyond parties. */
  getRoom(input: RoomInput): RoomDescriptor;
}

export const VIDEO_PROVIDER = Symbol('VIDEO_PROVIDER');
