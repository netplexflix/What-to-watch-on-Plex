// file: src/lib/deepEqual.ts
// Structural equality for the plain data the admin tabs hold: primitives, arrays and plain
// objects. Key order is irrelevant (a snapshot built in loadSettings() and the DEFAULT_*
// literal need not list keys in the same order); array order is significant, which is right
// for restricted_labels, selectedLibraries and corsOrigins.
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, i) => deepEqual(value, b[i]));
  }

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;
  return keysA.every(
    (key) => Object.prototype.hasOwnProperty.call(objB, key) && deepEqual(objA[key], objB[key])
  );
}
