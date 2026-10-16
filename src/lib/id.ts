let counter = 0

/** Stable-enough unique id. Uses crypto.randomUUID when the runtime has it. */
export function createId(prefix: string): string {
  const cryptoObj = globalThis.crypto
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `${prefix}-${cryptoObj.randomUUID().slice(0, 8)}`
  }
  counter += 1
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`
}
