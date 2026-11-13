/**
 * Serialize asynchronous writes in invocation order. One rejected write must
 * not prevent subsequent writes from running.
 */
export function createSaveQueue() {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const result = tail.then(job, job);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
