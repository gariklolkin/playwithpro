import { Role } from '@playwithpro/shared';
import {
  toSessionResponse,
  toSessionVideoItems,
  type SessionWithParties,
} from './session.mapper';

const HOUR = 3_600_000;

const base = {
  id: 'session-1',
  playerId: 'player-1',
  proProfileId: 'profile-1',
  serviceType: 'CONSULTATION',
  priceMinor: 4005,
  currency: 'EUR',
  platformFeeMinor: 401,
  slotId: 'slot-1',
  status: 'COMPLETED_PAID',
  startsAt: new Date(Date.now() - 3 * HOUR),
  endsAt: new Date(Date.now() - 2 * HOUR),
  expiresAt: null,
  playerConfirmedAt: new Date(),
  coachConfirmedAt: null,
  roomSlug: null,
  inviteSentAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  goal: null,
  player: {
    id: 'player-1',
    displayName: 'Player',
    avatarKey: 'avatars/player-1/a.png',
    playerProfile: {
      id: 'pp-1',
      userId: 'player-1',
      level: 'ADVANCED',
      style: 'OFFENSIVE',
      yearsOfExperience: 7,
      handedness: 'LEFT',
      grip: 'SHAKEHAND',
      about: 'Working on my loop',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    },
  },
  proProfile: {
    id: 'profile-1',
    userId: 'coach-1',
    status: 'VERIFIED',
    bio: '',
    languages: [],
    ratingSum: 0,
    ratingCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { displayName: 'Coach', avatarKey: null },
    services: [],
  },
  videos: [],
  payments: [{ status: 'RELEASED' }],
  dispute: null,
  review: null,
} as unknown as SessionWithParties;

const avatarUrlOf = (key: string) => `https://cdn.test/${key}`;

describe('toSessionResponse player context', () => {
  const coach = { id: 'coach-1', role: Role.Professional };
  const player = { id: 'player-1', role: Role.Amateur };

  it('embeds the card for the coach of a paid session', () => {
    const response = toSessionResponse(base, avatarUrlOf, { viewer: coach });
    expect(response.playerContext).toMatchObject({
      userId: 'player-1',
      displayName: 'Player',
      avatarUrl: 'https://cdn.test/avatars/player-1/a.png',
      filled: true,
      level: 'advanced',
      handedness: 'left',
      grip: 'shakehand',
      about: 'Working on my loop',
    });
  });

  it.each(['PENDING_PAYMENT', 'CANCELLED'])(
    'never embeds the card on a %s session',
    (status) => {
      const response = toSessionResponse(
        { ...base, status } as SessionWithParties,
        avatarUrlOf,
        { viewer: coach },
      );
      expect(response.playerContext).toBeNull();
    },
  );

  it('embeds nothing for the player, an admin, another coach, or no viewer', () => {
    for (const viewer of [
      player,
      { id: 'admin-1', role: Role.Admin },
      { id: 'coach-2', role: Role.Professional },
      undefined,
    ]) {
      expect(
        toSessionResponse(base, avatarUrlOf, { viewer }).playerContext,
      ).toBeNull();
    }
  });

  it('shows the unfilled state when the player never saved a profile', () => {
    const response = toSessionResponse(
      {
        ...base,
        player: { ...base.player, playerProfile: null },
      },
      avatarUrlOf,
      { viewer: coach },
    );
    expect(response.playerContext).toMatchObject({
      filled: false,
      level: 'beginner',
      displayName: 'Player',
    });
  });

  it('maps the goal for every reader', () => {
    const withGoal = { ...base, goal: 'Backhand loop' } as SessionWithParties;
    expect(toSessionResponse(withGoal, avatarUrlOf).goal).toBe('Backhand loop');
    expect(
      toSessionResponse(base, avatarUrlOf, { viewer: player }).goal,
    ).toBeNull();
  });
});

describe('toSessionResponse review fields', () => {
  it('marks a completed session without a review as reviewable', () => {
    const response = toSessionResponse(base, avatarUrlOf);

    expect(response.reviewable).toBe(true);
    expect(response.review).toBeNull();
  });

  it('keeps a completed session reviewable while the payout retry lags HELD', () => {
    const response = toSessionResponse(
      { ...base, payments: [{ status: 'HELD' }] },
      avatarUrlOf,
    );

    expect(response.reviewable).toBe(true);
  });

  it('maps an existing review and drops the reviewable flag', () => {
    const createdAt = new Date('2026-07-25T10:00:00Z');
    const response = toSessionResponse(
      {
        ...base,
        review: { rating: 4, text: 'Solid advice', createdAt },
      },
      avatarUrlOf,
    );

    expect(response.review).toEqual({
      rating: 4,
      text: 'Solid advice',
      createdAt: createdAt.toISOString(),
    });
    expect(response.reviewable).toBe(false);
  });

  it('marks a dispute resolved with a release as reviewable', () => {
    const response = toSessionResponse(
      {
        ...base,
        status: 'RESOLVED',
        dispute: { status: 'RESOLVED', reason: 'r', outcome: 'RELEASE' },
      },
      avatarUrlOf,
    );

    expect(response.reviewable).toBe(true);
  });

  it('never marks a refunded resolution reviewable', () => {
    const response = toSessionResponse(
      {
        ...base,
        status: 'RESOLVED',
        dispute: { status: 'RESOLVED', reason: 'r', outcome: 'REFUND' },
        payments: [{ status: 'REFUNDED' }],
      },
      avatarUrlOf,
    );

    expect(response.reviewable).toBe(false);
  });

  it('never marks an unfinished session reviewable', () => {
    const response = toSessionResponse(
      {
        ...base,
        status: 'AWAITING_CONFIRMATION',
        payments: [{ status: 'HELD' }],
      },
      avatarUrlOf,
    );

    expect(response.reviewable).toBe(false);
  });
});

describe('toSessionVideoItems', () => {
  it('exposes each clip with its probed frame rate and frame size', () => {
    expect(
      toSessionVideoItems([
        {
          position: 0,
          note: 'serve',
          video: {
            id: 'video-1',
            title: 'Serve drill',
            durationSeconds: 45,
            fps: 59.94,
            width: 1080,
            height: 1920,
          },
        },
        {
          position: 2,
          note: null,
          video: {
            id: 'video-2',
            title: 'Match',
            durationSeconds: null,
            fps: null,
            width: null,
            height: null,
          },
        },
      ]),
    ).toEqual([
      {
        videoId: 'video-1',
        title: 'Serve drill',
        note: 'serve',
        durationSeconds: 45,
        fps: 59.94,
        width: 1080,
        height: 1920,
        position: 0,
      },
      {
        videoId: 'video-2',
        title: 'Match',
        note: null,
        durationSeconds: null,
        fps: null,
        width: null,
        height: null,
        position: 2,
      },
    ]);
  });
});
