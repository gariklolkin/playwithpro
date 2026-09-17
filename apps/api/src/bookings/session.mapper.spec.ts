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
  paidAt: new Date(Date.now() - 100 * HOUR),
  cancelFreeHours: 24,
  cancelLateRefundPercent: 50,
  cancelNoRefundHours: 2,
  cancelGraceMin: 30,
  cancelledAt: null,
  cancelledBy: null,
  cancellationTier: null,
  cancellationRefundMinor: null,
  cancellationLate: false,
  cancellationReason: null,
  feeWaivedAt: null,
  feeWaivedById: null,
  coachGameAnswer: null,
  attendanceOutcome: null,
  attendancePartial: false,
  classifiedAt: null,
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
  attendance: [],
  review: null,
} as unknown as SessionWithParties;

const resolvedDispute = (outcome: 'RELEASE' | 'REFUND') =>
  ({
    status: 'RESOLVED',
    kind: 'PLAYER_REPORTED',
    reasonCategory: 'OTHER',
    reason: 'r',
    outcome,
    responseDueAt: null,
    coachResponse: null,
    coachRespondedAt: null,
    resolvedVia: 'ADMIN',
    systemNoteCode: null,
  }) as SessionWithParties['dispute'];

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
        dispute: resolvedDispute('RELEASE'),
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
        dispute: resolvedDispute('REFUND'),
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

describe('no-show protection fields', () => {
  const extras = {
    roomWindow: { beforeMin: 15, afterMin: 30 },
    autoConfirmWindowHours: 48,
  };

  it('summarizes attendance of a past online session without raw rows', () => {
    const response = toSessionResponse(
      {
        ...base,
        status: 'DISPUTED',
        attendanceOutcome: 'COACH_NO_SHOW',
        classifiedAt: new Date(),
        attendance: [
          {
            userId: 'player-1',
            joinedAt: base.startsAt,
            connectedAt: base.startsAt,
            leftAt: new Date(base.startsAt.getTime() + HOUR / 2),
          },
        ],
        dispute: {
          ...resolvedDispute('REFUND'),
          status: 'OPEN',
          kind: 'COACH_NO_SHOW',
          outcome: null,
          reasonCategory: null,
          reason: null,
          resolvedVia: null,
          responseDueAt: new Date('2026-09-22T10:00:00Z'),
        },
      } as SessionWithParties,
      avatarUrlOf,
      extras,
    );

    expect(response.attendance).toEqual({
      playerFirstConnectedAt: base.startsAt.toISOString(),
      coachFirstConnectedAt: null,
      overlapMinutes: 0,
      coachLateMinutes: 0,
      partial: false,
      outcome: 'coach_no_show',
    });
    expect(response.dispute).toMatchObject({
      kind: 'coach_no_show',
      reason: null,
      responseDueAt: '2026-09-22T10:00:00.000Z',
    });
    expect(JSON.stringify(response)).not.toContain('joinedAt');
  });

  it('carries no summary for a game and hides the countdown until the coach answers', () => {
    const game = {
      ...base,
      serviceType: 'GAME',
      status: 'AWAITING_CONFIRMATION',
      payments: [{ status: 'HELD' }],
    } as SessionWithParties;
    const silent = toSessionResponse(game, avatarUrlOf, extras);
    expect(silent.attendance).toBeNull();
    expect(silent.autoConfirmAt).toBeNull();

    const answered = toSessionResponse(
      {
        ...game,
        coachConfirmedAt: new Date(),
        coachGameAnswer: 'PLAYER_ABSENT',
      },
      avatarUrlOf,
      extras,
    );
    expect(answered.coachGameAnswer).toBe('player_absent');
    expect(answered.autoConfirmAt).not.toBeNull();
  });
});

describe('cancellation fields', () => {
  const upcoming = {
    ...base,
    status: 'PAID_ESCROW',
    startsAt: new Date(Date.now() + 10 * HOUR),
    endsAt: new Date(Date.now() + 11 * HOUR),
    payments: [{ status: 'HELD' }],
  } as SessionWithParties;
  const player = { id: 'player-1', role: Role.Amateur };
  const coach = { id: 'coach-1', role: Role.Professional };

  it('tells each party what cancelling now means for them', () => {
    const forPlayer = toSessionResponse(upcoming, avatarUrlOf, {
      viewer: player,
    });
    expect(forPlayer.cancellationTerms).toEqual({
      tier: 'partial',
      refundMinor: 2003,
      coachNetMinor: 1802,
      late: false,
    });
    expect(forPlayer.cancellationPolicy).toEqual({
      freeUntil: new Date(
        upcoming.startsAt.getTime() - 24 * HOUR,
      ).toISOString(),
      partialUntil: new Date(
        upcoming.startsAt.getTime() - 2 * HOUR,
      ).toISOString(),
      graceUntil: null,
      lateRefundPercent: 50,
      graceMinutes: 30,
    });

    const forCoach = toSessionResponse(upcoming, avatarUrlOf, {
      viewer: coach,
    });
    expect(forCoach.cancellationTerms).toEqual({
      tier: 'free',
      refundMinor: 4005,
      coachNetMinor: 0,
      late: true,
    });
  });

  it('previews the grace on an unpaid late booking and offers no terms yet', () => {
    const response = toSessionResponse(
      {
        ...upcoming,
        status: 'PENDING_PAYMENT',
        paidAt: null,
        payments: [],
      } as SessionWithParties,
      avatarUrlOf,
      { viewer: player },
    );
    expect(response.cancellationPolicy?.graceUntil).not.toBeNull();
    expect(response.cancellationTerms).toBeNull();
    expect(response.cancellation).toBeNull();
  });

  it('exposes nothing to a reader who is not a party, or once started', () => {
    expect(
      toSessionResponse(upcoming, avatarUrlOf, {
        viewer: { id: 'admin-1', role: Role.Admin },
      }).cancellationTerms,
    ).toBeNull();
    const started = toSessionResponse(
      { ...upcoming, status: 'IN_PROGRESS' } as SessionWithParties,
      avatarUrlOf,
      { viewer: player },
    );
    expect(started.cancellationTerms).toBeNull();
    expect(started.cancellationPolicy).toBeNull();
  });

  it('describes a late cancellation that still waits for the start time', () => {
    const response = toSessionResponse(
      {
        ...upcoming,
        status: 'CANCELLED',
        cancelledAt: new Date('2026-09-18T08:00:00Z'),
        cancelledBy: 'PLAYER',
        cancellationTier: 'PARTIAL',
        cancellationRefundMinor: 2003,
      } as SessionWithParties,
      avatarUrlOf,
      { viewer: coach },
    );
    expect(response.cancellation).toEqual({
      by: 'player',
      at: '2026-09-18T08:00:00.000Z',
      tier: 'partial',
      refundMinor: 2003,
      coachNetMinor: 1802,
      late: false,
      waived: false,
      settled: false,
      settlesAt: upcoming.startsAt.toISOString(),
    });
  });

  it('describes a waived cancellation as a settled full refund', () => {
    const response = toSessionResponse(
      {
        ...upcoming,
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: 'PLAYER',
        cancellationTier: 'NONE',
        cancellationRefundMinor: 4005,
        feeWaivedAt: new Date(),
        payments: [{ status: 'REFUNDED' }],
      } as SessionWithParties,
      avatarUrlOf,
    );
    expect(response.cancellation).toMatchObject({
      tier: 'none',
      refundMinor: 4005,
      coachNetMinor: 0,
      waived: true,
      settled: true,
      settlesAt: null,
    });
  });

  it('has no record for an unpaid release', () => {
    expect(
      toSessionResponse(
        { ...base, status: 'CANCELLED', payments: [] } as SessionWithParties,
        avatarUrlOf,
      ).cancellation,
    ).toBeNull();
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
