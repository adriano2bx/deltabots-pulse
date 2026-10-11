/** Remove PII/segredos de textos de log (docs/12: logs sem PII, MAC, tokens). */
const PATTERNS: Array<[RegExp, string]> = [
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[jwt]'],
  [/\b(pk|sk|pul)_[A-Za-z0-9_-]{16,}\b/g, '[secret]'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[email]'],
  [/\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, '[mac]'],
  [/\b(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, '[phone]'],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[token]'],
  [/(\b(?:ticket|token|access_token|refresh_token|api_key|key|secret|password)=)[^&\s]+/gi, '$1[redacted]'],
];

export function redact(text: string): string {
  let out = text;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

const SENSITIVE_KEYS =
  /^(password|pass|secret|token|access_token|refresh_token|authorization|email|phone|mac|address|api_key|key|ticket|otp|mfa_code)$/i;

/** Redação profunda de objetos para logs estruturados. */
export function redactObject(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth]';
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactObject(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value))
      out[k] = SENSITIVE_KEYS.test(k) ? '[redacted]' : redactObject(v, depth + 1);
    return out;
  }
  return value;
}
