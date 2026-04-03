/**
 * Base adapter class
 * Provides common functionality for all CLI adapters
 */

import { spawn, ChildProcess } from 'child_process';
import { Adapter, AdapterConfig, AdapterExecutionContext, AdapterExecutionResult, RunProcessResult } from './types';

/**
 * Running processes registry
 * Key: runId, Value: process info
 */
export const runningProcesses = new Map<string, {
  child: ChildProcess;
  graceSec: number;
}>();

/**
 * Maximum capture bytes for stdout/stderr
 */
export const MAX_CAPTURE_BYTES = 4 * 1024 * 1024; // 4MB

/**
 * Maximum excerpt bytes for logs
 */
export const MAX_EXCERPT_BYTES = 32 * 1024; // 32KB

/**
 * Sensitive environment key patterns
 */
const SENSITIVE_ENV_KEY = /(key|token|secret|password|passwd|authorization|cookie)/i;

/**
 * Helper functions
 */
export function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function parseJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function appendWithCap(prev: string, chunk: string, cap = MAX_CAPTURE_BYTES): string {
  const combined = prev + chunk;
  return combined.length > cap ? combined.slice(combined.length - cap) : combined;
}

export function redactEnvForLogs(env: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    redacted[key] = SENSITIVE_ENV_KEY.test(key) ? '***REDACTED***' : value;
  }
  return redacted;
}

/**
 * Ensure PATH environment variable is set
 */
export function ensurePathInEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }

  // Ensure common paths are in PATH
  if (result.PATH) {
    const commonPaths = [
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      process.env.HOME ? `${process.env.HOME}/.local/bin` : '',
      process.env.HOME ? `${process.env.HOME}/.npm-global/bin` : '',
    ].filter(Boolean);

    const currentPaths = result.PATH.split(':');
    for (const p of commonPaths) {
      if (p && !currentPaths.includes(p)) {
        currentPaths.push(p);
      }
    }
    result.PATH = currentPaths.join(':');
  }

  return result;
}

/**
 * Abstract base class for adapters
 */
export abstract class BaseAdapter implements Adapter {
  abstract readonly type: string;
  abstract readonly label: string;

  abstract execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult>;

  /**
   * Run a child process
   */
  protected async runChildProcess(
    runId: string,
    command: string,
    args: string[],
    options: {
      cwd: string;
      env: Record<string, string>;
      timeoutSec: number;
      graceSec: number;
      stdin?: string;
      onLog: (stream: 'stdout' | 'stderr', chunk: string) => Promise<void>;
      /** Optional callback for raw stdout chunks (for streaming event parsing) */
      onStdout?: (chunk: string) => void;
      onSpawn?: (meta: { pid: number; startedAt: string }) => Promise<void>;
    },
  ): Promise<RunProcessResult> {
    return new Promise<RunProcessResult>((resolve, reject) => {
      // Merge with process.env and strip nesting-guard vars
      const rawMerged: NodeJS.ProcessEnv = { ...process.env, ...options.env };

      // Strip Claude Code nesting-guard env vars
      const NESTING_VARS = [
        'CLAUDECODE',
        'CLAUDE_CODE_ENTRYPOINT',
        'CLAUDE_CODE_SESSION',
        'CLAUDE_CODE_PARENT_SESSION',
      ];
      for (const key of NESTING_VARS) {
        delete rawMerged[key];
      }

      const mergedEnv = ensurePathInEnv(rawMerged);
      const startedAt = new Date().toISOString();

      const child = spawn(command, args, {
        cwd: options.cwd,
        env: mergedEnv,
        shell: false,
        stdio: [options.stdin != null ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      });

      // Write stdin if provided
      if (options.stdin != null && child.stdin) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }

      // Notify spawn
      if (typeof child.pid === 'number' && child.pid > 0 && options.onSpawn) {
        options.onSpawn({ pid: child.pid, startedAt }).catch(() => {});
      }

      // Register running process
      runningProcesses.set(runId, { child, graceSec: options.graceSec });

      let timedOut = false;
      let stdout = '';
      let stderr = '';
      let logChain: Promise<void> = Promise.resolve();

      // Timeout handler
      const timeout = options.timeoutSec > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            setTimeout(() => {
              if (!child.killed) {
                child.kill('SIGKILL');
              }
            }, Math.max(1, options.graceSec) * 1000);
          }, options.timeoutSec * 1000)
        : null;

      // Handle stdout
      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout = appendWithCap(stdout, text);

        // Call onStdout for streaming event parsing (if provided)
        if (options.onStdout) {
          options.onStdout(text);
        }

        logChain = logChain
          .then(() => options.onLog('stdout', text))
          .catch(() => {});
      });

      // Handle stderr
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr = appendWithCap(stderr, text);
        logChain = logChain
          .then(() => options.onLog('stderr', text))
          .catch(() => {});
      });

      // Handle error
      child.on('error', (err: Error) => {
        if (timeout) clearTimeout(timeout);
        runningProcesses.delete(runId);
        const errno = (err as NodeJS.ErrnoException).code;
        const pathValue = mergedEnv.PATH || '';
        const msg = errno === 'ENOENT'
          ? `Failed to start command "${command}" in "${options.cwd}". Verify adapter command and PATH (${pathValue}).`
          : `Failed to start command "${command}" in "${options.cwd}": ${err.message}`;
        reject(new Error(msg));
      });

      // Handle close
      child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        if (timeout) clearTimeout(timeout);
        runningProcesses.delete(runId);

        void logChain.finally(() => {
          resolve({
            exitCode: code,
            signal,
            timedOut,
            stdout,
            stderr,
            pid: child.pid ?? null,
            startedAt,
          });
        });
      });
    });
  }
}