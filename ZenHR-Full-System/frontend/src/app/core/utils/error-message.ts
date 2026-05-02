export function getErrorMessage(error: unknown, fallback: string): string {
  const err = error as any;
  const candidates = [
    err?.error?.message,
    err?.error?.error,
    err?.message,
    err?.statusText
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return fallback;
}
