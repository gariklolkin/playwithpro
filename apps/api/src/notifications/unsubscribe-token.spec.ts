import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from './unsubscribe-token';

describe('unsubscribe token', () => {
  const secret = 's3cret';

  it('round-trips the user id and category', () => {
    const token = signUnsubscribeToken(secret, {
      userId: 'u1',
      category: 'emailReminders',
    });
    expect(verifyUnsubscribeToken(secret, token)).toMatchObject({
      userId: 'u1',
      category: 'emailReminders',
    });
  });

  it('rejects tampering, another secret, expiry and unknown categories', () => {
    const token = signUnsubscribeToken(secret, {
      userId: 'u1',
      category: 'emailReviews',
    });
    expect(verifyUnsubscribeToken('other', token)).toBeNull();
    expect(verifyUnsubscribeToken(secret, `${token}x`)).toBeNull();
    expect(verifyUnsubscribeToken(secret, 'garbage')).toBeNull();
    const old = signUnsubscribeToken(
      secret,
      { userId: 'u1', category: 'emailReviews' },
      0,
    );
    expect(verifyUnsubscribeToken(secret, old)).toBeNull();
    const forged = Buffer.from(
      JSON.stringify({
        userId: 'u1',
        category: 'passwordHash',
        exp: Date.now() + 1e9,
      }),
    ).toString('base64url');
    const signed = signUnsubscribeToken(secret, {
      userId: 'u1',
      category: 'emailReviews',
    });
    expect(
      verifyUnsubscribeToken(secret, `${forged}.${signed.split('.')[1]}`),
    ).toBeNull();
  });
});
