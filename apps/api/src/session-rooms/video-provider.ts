import type { RoomDescriptor } from '@playwithpro/shared';

/**
 * Port for the video-call integration behind session rooms. Business logic
 * depends only on this interface; the vendor (self-hosted LiveKit in MVP,
 * LiveKit Cloud or another SFU later) is an implementation detail.
 */
export interface RoomInput {
  /** Random slug minted at payment; names the room, grants nothing by itself. */
  roomSlug: string;
}

export interface TokenInput extends RoomInput {
  participant: {
    /** Platform user id — becomes the participant identity. */
    id: string;
    displayName: string;
    role: 'player' | 'coach';
  };
}

export interface VideoProvider {
  /** Where the call lives; safe to hand to parties inside the join window. */
  describeRoom(input: RoomInput): RoomDescriptor;
  /** Short-lived participant credential scoped to this one room. */
  issueToken(input: TokenInput): Promise<string>;
}

export const VIDEO_PROVIDER = Symbol('VIDEO_PROVIDER');
