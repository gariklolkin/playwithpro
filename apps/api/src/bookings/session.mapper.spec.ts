import { toSessionResponse, type SessionWithParties } from './session.mapper';

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
  videoId: null,
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
  player: { id: 'player-1', displayName: 'Player', avatarKey: null },
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
  video: null,
  payments: [{ status: 'RELEASED' }],
  dispute: null,
  review: null,
} as unknown as SessionWithParties;

const avatarUrlOf = (key: string) => `https://cdn.test/${key}`;

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
