import { Effect, Semaphore } from "effect";

interface Lock {
  semaphore: Semaphore.Semaphore;
  users: number;
}

// V2 retains captured tool executors across reloads. All module generations in
// this server must serialize the same session intent, including across moves:
// plugin storage is session-keyed, not directory-keyed.
const key = Symbol.for("opencode-beads.session-locks.v1");
const runtime = globalThis as typeof globalThis & { [key]?: Map<string, Lock> };
const locks = (runtime[key] ??= new Map<string, Lock>());

export function withSessionLock<A, E, R>(
  id: string,
  operation: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.suspend(() => {
    const lock = locks.get(id) ?? {
      semaphore: Semaphore.makeUnsafe(1),
      users: 0,
    };
    locks.set(id, lock);
    lock.users++;
    return lock.semaphore.withPermit(operation).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          lock.users--;
          if (lock.users === 0) locks.delete(id);
        }),
      ),
    );
  });
}
