/**
 * Claude CLI stream JSON parser
 * Handles NDJSON format output from claude --output-format stream-json --verbose
 */

import { UsageSummary, ParsedStreamResult } from '../types';
import { parseObject, parseJson, asString, asNumber } from '../base';

/**
 * Auth required regex patterns
 */
const CLAUDE_AUTH_REQUIRED_RE = /(?:not\s+logged\s+in|please\s+log\s+in|please\s+run\s+`?claude\s+login`?|login\s+required|requires\s+login|unauthorized|authentication\s+required)/i;

/**
 * URL extraction regex
 */
const URL_RE = /(https?:\/\/[^\s'"`<>()[\]{};,!?]+[^\s'"`<>()[\]{};,!.?:]+)/gi;

/**
 * Parse Claude stream JSON output
 */
export function parseClaudeStreamJson(stdout: string): ParsedStreamResult {
  let sessionId: string | null = null;
  let model = '';
  let finalResult: Record<string, unknown> | null = null;
  const assistantTexts: string[] = [];

  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const event = parseJson(line);
    if (!event) continue;

    const type = asString(event.type, '');

    // System init
    if (type === 'system' && asString(event.subtype, '') === 'init') {
      sessionId = asString(event.session_id, sessionId ?? '') || sessionId;
      model = asString(event.model, model);
      continue;
    }

    // Assistant message
    if (type === 'assistant') {
      sessionId = asString(event.session_id, sessionId ?? '') || sessionId;
      const message = parseObject(event.message);
      const content = Array.isArray(message.content) ? message.content : [];

      for (const entry of content) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
        const block = entry as Record<string, unknown>;

        if (asString(block.type, '') === 'text') {
          const text = asString(block.text, '');
          if (text) assistantTexts.push(text);
        }
      }
      continue;
    }

    // Result message
    if (type === 'result') {
      finalResult = event;
      sessionId = asString(event.session_id, sessionId ?? '') || sessionId;
    }
  }

  // Build result
  if (!finalResult) {
    return {
      sessionId,
      model,
      costUsd: null,
      usage: null,
      summary: assistantTexts.join('\n\n').trim(),
      resultJson: null,
    };
  }

  const usageObj = parseObject(finalResult.usage);
  const usage: UsageSummary = {
    inputTokens: asNumber(usageObj.input_tokens, 0),
    cachedInputTokens: asNumber(usageObj.cache_read_input_tokens, 0),
    outputTokens: asNumber(usageObj.output_tokens, 0),
  };

  const costRaw = finalResult.total_cost_usd;
  const costUsd = typeof costRaw === 'number' && Number.isFinite(costRaw) ? costRaw : null;
  const summary = asString(finalResult.result, assistantTexts.join('\n\n')).trim();

  return {
    sessionId,
    model,
    costUsd,
    usage,
    summary,
    resultJson: finalResult,
  };
}

/**
 * Extract error messages from parsed result
 */
function extractClaudeErrorMessages(parsed: Record<string, unknown>): string[] {
  const raw = Array.isArray(parsed.errors) ? parsed.errors : [];
  const messages: string[] = [];

  for (const entry of raw) {
    if (typeof entry === 'string') {
      const msg = entry.trim();
      if (msg) messages.push(msg);
      continue;
    }

    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }

    const obj = entry as Record<string, unknown>;
    const msg = asString(obj.message, '') || asString(obj.error, '') || asString(obj.code, '');
    if (msg) {
      messages.push(msg);
      continue;
    }

    try {
      messages.push(JSON.stringify(obj));
    } catch {
      // skip non-serializable entry
    }
  }

  return messages;
}

/**
 * Extract login URL from text
 */
export function extractClaudeLoginUrl(text: string): string | null {
  const match = text.match(URL_RE);
  if (!match || match.length === 0) return null;

  for (const rawUrl of match) {
    const cleaned = rawUrl.replace(/[\])}.!,?;:'\"]+$/g, '');
    if (cleaned.includes('claude') || cleaned.includes('anthropic') || cleaned.includes('auth')) {
      return cleaned;
    }
  }

  return match[0]?.replace(/[\])}.!,?;:'\"]+$/g, '') ?? null;
}

/**
 * Detect if Claude requires login
 */
export function detectClaudeLoginRequired(input: {
  parsed: Record<string, unknown> | null;
  stdout: string;
  stderr: string;
}): { requiresLogin: boolean; loginUrl: string | null } {
  const resultText = asString(input.parsed?.result, '').trim();
  const messages = [
    resultText,
    ...extractClaudeErrorMessages(input.parsed ?? {}),
    input.stdout,
    input.stderr,
  ]
    .join('\n')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const requiresLogin = messages.some((line) => CLAUDE_AUTH_REQUIRED_RE.test(line));

  return {
    requiresLogin,
    loginUrl: extractClaudeLoginUrl([input.stdout, input.stderr].join('\n')),
  };
}

/**
 * Describe Claude failure
 */
export function describeClaudeFailure(parsed: Record<string, unknown>): string | null {
  const subtype = asString(parsed.subtype, '');
  const resultText = asString(parsed.result, '').trim();
  const errors = extractClaudeErrorMessages(parsed);

  let detail = resultText;
  if (!detail && errors.length > 0) {
    detail = errors[0] ?? '';
  }

  const parts = ['Claude run failed'];
  if (subtype) parts.push(`subtype=${subtype}`);
  if (detail) parts.push(detail);

  return parts.length > 1 ? parts.join(': ') : null;
}

/**
 * Check if result indicates max turns reached
 */
export function isClaudeMaxTurnsResult(parsed: Record<string, unknown> | null | undefined): boolean {
  if (!parsed) return false;

  const subtype = asString(parsed.subtype, '').trim().toLowerCase();
  if (subtype === 'error_max_turns') return true;

  const stopReason = asString(parsed.stop_reason, '').trim().toLowerCase();
  if (stopReason === 'max_turns') return true;

  const resultText = asString(parsed.result, '').trim();
  return /max(?:imum)?\s+turns?/i.test(resultText);
}

/**
 * Check if result indicates unknown session error
 */
export function isClaudeUnknownSessionError(parsed: Record<string, unknown>): boolean {
  const resultText = asString(parsed.result, '').trim();
  const allMessages = [
    resultText,
    ...extractClaudeErrorMessages(parsed),
  ]
    .map((msg) => msg.trim())
    .filter(Boolean);

  return allMessages.some((msg) =>
    /no conversation found with session id|unknown session|session .* not found/i.test(msg),
  );
}

/**
 * Parse fallback error message
 */
export function parseFallbackErrorMessage(
  exitCode: number | null,
  stdout: string,
  stderr: string,
): string {
  const stderrLine = stderr.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';

  if ((exitCode ?? 0) === 0) {
    return 'Failed to parse claude JSON output';
  }

  return stderrLine
    ? `Claude exited with code ${exitCode ?? -1}: ${stderrLine}`
    : `Claude exited with code ${exitCode ?? -1}`;
}