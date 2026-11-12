// Canonical serialization (sorted object keys, no whitespace) + FNV-1a 32.

export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new Error(`canonicalize: non-finite number ${value}`);
      return JSON.stringify(value);
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'undefined':
      throw new Error('canonicalize: undefined is not JSON');
    case 'object': {
      if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
    }
    default:
      throw new Error(`canonicalize: unsupported type ${typeof value}`);
  }
}

export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h ^= c & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= c >>> 8;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function hashValue(value: unknown): string {
  return fnv1a32(canonicalize(value)).toString(16).padStart(8, '0');
}
