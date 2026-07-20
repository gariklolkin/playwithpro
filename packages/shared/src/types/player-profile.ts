import type {
  Grip,
  Handedness,
  PlayerLevel,
  PlayingStyle,
} from "../enums/player-profile";

export const PLAYER_ABOUT_MAX_LENGTH = 4000;

export interface PlayerProfileResponse {
  id: string;
  level: PlayerLevel;
  style: PlayingStyle | null;
  yearsOfExperience: number | null;
  handedness: Handedness | null;
  grip: Grip | null;
  about: string;
}

export interface UpdatePlayerProfileRequest {
  level?: PlayerLevel;
  style?: PlayingStyle | null;
  yearsOfExperience?: number | null;
  handedness?: Handedness | null;
  grip?: Grip | null;
  about?: string;
}

/** Read-only view for coaches/admins: playing details + public identity. */
export interface PlayerCardResponse extends PlayerProfileResponse {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}
