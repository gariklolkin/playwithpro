/**
 * One data location's erase step. Registered as a multi-provider under
 * ACCOUNT_ERASURE_HOOKS and run in registration order by the deletion job,
 * which records each outcome on the request and skips steps already done on
 * a retry — so every hook must be idempotent. Later features (recordings,
 * annotations, messages, Fider) plug in by adding a hook.
 */
export interface AccountErasureHook {
  /** Stable step name, the key in AccountDataRequest.steps. */
  readonly name: string;
  /** Erase this location's data of the user; throw to record a failure. */
  erase(userId: string): Promise<ErasureOutcome>;
}

export type ErasureOutcome =
  { status: 'done' } | { status: 'skipped'; reason: string };

export const ACCOUNT_ERASURE_HOOKS = Symbol('ACCOUNT_ERASURE_HOOKS');

export const done: ErasureOutcome = { status: 'done' };
export const skipped = (reason: string): ErasureOutcome => ({
  status: 'skipped',
  reason,
});
