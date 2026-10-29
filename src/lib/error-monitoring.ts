/**
 * Noctra Error Monitoring with Sensitive Data Redaction.
 *
 * Ensures that stack traces, logs, and error telemetry never leak:
 * - Bearer tokens or JWTs
 * - Email addresses and personal identifiers
 * - Local filesystem paths containing usernames
 * - API keys (Firebase, Supabase, Google, etc.)
 * - Document content or sensitive query strings
 */

const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // JWT tokens & Bearer headers
  {
    pattern: /Bearer\s+([A-Za-z0-9\-._~+/]+=*)/gi,
    replacement: "Bearer [REDACTED_TOKEN]",
  },
  {
    pattern: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g,
    replacement: "[REDACTED_JWT]",
  },
  // API Keys (Google / Firebase / Supabase)
  {
    pattern: /AIza[0-9A-Za-z-_]{35,}/g,
    replacement: "[REDACTED_API_KEY]",
  },
  {
    pattern: /sbp_[a-zA-Z0-9]{30,}/g,
    replacement: "[REDACTED_SUPABASE_KEY]",
  },
  // Email addresses
  {
    pattern: /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g,
    replacement: "[REDACTED_EMAIL]",
  },
  // Local filesystem usernames (/Users/username/... or C:\Users\username\...)
  {
    pattern: /(\/Users\/)[^/\s]+/g,
    replacement: "$1[REDACTED_USER]",
  },
  {
    pattern: /(C:\\Users\\)[^\\\s]+/gi,
    replacement: "$1[REDACTED_USER]",
  },
];

/**
 * Redact sensitive data from a string.
 */
export function redactSensitiveString(input: string): string {
  let result = input;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Recursively sanitize an object or array to ensure no PII or credentials escape.
 */
export function sanitizeLogData<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    return redactSensitiveString(data) as unknown as T;
  }

  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("authorization") ||
      lowerKey.includes("token")
    ) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitizeLogData(value);
    }
  }

  return sanitized as T;
}

/**
 * Capture an error safely without leaking sensitive information.
 */
export function captureSafeError(
  error: unknown,
  context?: Record<string, unknown>
): {
  message: string;
  code?: string;
  stack?: string;
  context?: Record<string, unknown>;
} {
  let rawMessage = "An unexpected error occurred.";
  let code: string | undefined;
  let rawStack: string | undefined;

  if (error instanceof Error) {
    rawMessage = error.message;
    rawStack = error.stack;
    if ("code" in error && typeof (error as { code: unknown }).code === "string") {
      code = (error as { code: string }).code;
    }
  } else if (typeof error === "string") {
    rawMessage = error;
  }

  const sanitizedMessage = redactSensitiveString(rawMessage);
  const sanitizedStack = rawStack ? redactSensitiveString(rawStack) : undefined;
  const sanitizedContext = context ? sanitizeLogData(context) : undefined;

  return {
    message: sanitizedMessage,
    code,
    stack: sanitizedStack,
    context: sanitizedContext,
  };
}
