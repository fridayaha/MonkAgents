/**
 * Claude CLI Adapter - Execute
 * Handles execution of Claude Code CLI with proper session management
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { BaseAdapter, asString, asNumber, asBoolean, asStringArray, parseObject, parseJson } from '../base';
import {
  Adapter,
  AdapterExecutionContext,
  AdapterExecutionResult,
  RunProcessResult,
  UsageSummary,
  StreamEvent,
  AdapterSkillsConfig,
} from '../types';
import { ClaudeStreamParser } from './parser';
import {
  parseClaudeStreamJson,
  describeClaudeFailure,
  detectClaudeLoginRequired,
  isClaudeMaxTurnsResult,
  isClaudeUnknownSessionError,
  parseFallbackErrorMessage,
} from './parse';

/**
 * Default tools that are disabled globally
 * WebSearch is disabled because it's not available in China
 */
const DEFAULT_DISALLOWED_TOOLS = ['WebSearch'];

/**
 * Create a temporary directory with .claude/skills/ containing symlinks to
 * the desired skills. This allows Claude CLI to discover skills via --add-dir.
 *
 * Based on Paperclip's buildSkillsDir implementation.
 */
async function buildSkillsDir(skillsConfig: AdapterSkillsConfig | undefined): Promise<string | null> {
  if (!skillsConfig || !skillsConfig.skillIds || skillsConfig.skillIds.length === 0) {
    return null;
  }

  const { skillsDirectory, skillIds } = skillsConfig;

  // Check if skills directory exists
  if (!fs.existsSync(skillsDirectory)) {
    return null;
  }

  // Create temp directory
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'monkagents-skills-'));
  const target = path.join(tmp, '.claude', 'skills');
  await fs.promises.mkdir(target, { recursive: true });

  // Create symlinks for each skill
  for (const skillId of skillIds) {
    const sourcePath = path.join(skillsDirectory, skillId);
    const targetPath = path.join(target, skillId);

    // Check if skill directory exists
    if (fs.existsSync(sourcePath)) {
      try {
        await fs.promises.symlink(sourcePath, targetPath);
      } catch (err) {
        // Ignore symlink errors (e.g., already exists)
      }
    }
  }

  return tmp;
}

/**
 * Claude Local Adapter
 * Executes Claude Code CLI locally
 */
export class ClaudeLocalAdapter extends BaseAdapter implements Adapter {
  readonly type = 'claude-local';
  readonly label = 'Claude Code (local)';

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    const { runId, agentId, agentName, config, runtime, context, onLog, onSpawn } = ctx;

    // Extract configuration
    const command = asString(config.command, 'claude');
    const baseArgs = asStringArray(config.args);
    const timeoutSec = asNumber(config.timeoutSec, 0);
    const graceSec = asNumber(config.graceSec, 20);
    const dangerouslySkipPermissions = asBoolean(config.dangerouslySkipPermissions, false);
    const maxTurns = asNumber(config.maxTurns, 0);
    const model = asString(config.model, '');
    const effort = asString(config.effort, '');
    const chrome = asBoolean(config.chrome, false);
    const extraArgs = asStringArray(config.extraArgs);
    const envConfig = parseObject(config.env);

    // Get session info
    const runtimeSessionParams = parseObject(runtime.sessionParams);
    const runtimeSessionId = asString(runtimeSessionParams.sessionId, runtime.sessionId ?? '');
    const runtimeSessionCwd = asString(runtimeSessionParams.cwd, '');
    const canResumeSession =
      runtimeSessionId.length > 0 &&
      (runtimeSessionCwd.length === 0 || path.resolve(runtimeSessionCwd) === path.resolve(context.workingDirectory));
    const sessionId = canResumeSession ? runtimeSessionId : null;

    if (runtimeSessionId && !canResumeSession) {
      await onLog(
        'stdout',
        `[MonkAgents] Session "${runtimeSessionId}" was saved for different cwd, starting fresh.\n`,
      );
    }

    // Build environment
    const env: Record<string, string> = { ...context.env };
    for (const [key, value] of Object.entries(envConfig)) {
      if (typeof value === 'string') env[key] = value;
    }

    // Build prompt metrics
    const promptMetrics = {
      promptChars: context.prompt.length,
    };

    // Build skills directory (ephemeral)
    let skillsDir: string | null = null;
    try {
      skillsDir = await buildSkillsDir(context.skills);
    } catch (err) {
      await onLog('stderr', `[MonkAgents] Failed to build skills directory: ${err}\n`);
    }

    // Build CLI args
    const buildClaudeArgs = (resumeSessionId: string | null): string[] => {
      const args = [...baseArgs];

      // Resume session
      if (resumeSessionId) {
        args.push('--resume', resumeSessionId);
      }

      // Key feature: Skip all permission confirmations
      if (dangerouslySkipPermissions) {
        args.push('--dangerously-skip-permissions');
      }

      // Permission mode (if not skipping all permissions)
      if (!dangerouslySkipPermissions && context.permissionMode) {
        args.push('--permission-mode', context.permissionMode);
      }

      // Skills directory (ephemeral skill mounting)
      if (skillsDir) {
        args.push('--add-dir', skillsDir);
      }

      // Chrome mode
      if (chrome) {
        args.push('--chrome');
      }

      // Model selection
      if (model) {
        args.push('--model', model);
      }

      // Reasoning effort
      if (effort) {
        args.push('--effort', effort);
      }

      // Max turns
      if (maxTurns > 0) {
        args.push('--max-turns', String(maxTurns));
      }

      // MCP configuration
      if (context.mcpConfig) {
        args.push('--mcp-config', context.mcpConfig);
      }

      // Disallowed tools (merge default with context)
      const disallowedTools = new Set<string>(DEFAULT_DISALLOWED_TOOLS);
      if (context.disallowedTools && context.disallowedTools.length > 0) {
        context.disallowedTools.forEach(tool => disallowedTools.add(tool));
      }
      if (disallowedTools.size > 0) {
        args.push('--disallowedTools', Array.from(disallowedTools).join(','));
      }

      // Allowed tools
      if (context.allowedTools && context.allowedTools.length > 0) {
        args.push('--allowedTools', context.allowedTools.join(','));
      }

      // Extra args
      if (extraArgs.length > 0) {
        args.push(...extraArgs);
      }

      return args;
    };

    // Run attempt
    const runAttempt = async (resumeSessionId: string | null): Promise<{
      proc: RunProcessResult;
      parsedStream: ReturnType<typeof parseClaudeStreamJson>;
      parsed: Record<string, unknown> | null;
      streamParser: ClaudeStreamParser;
    }> => {
      const args = buildClaudeArgs(resumeSessionId);
      const streamParser = new ClaudeStreamParser();

      // Log execution info
      const argsDisplay = args.map(a => {
        // Truncate long MCP config for readability, but show structure
        if (a.startsWith('{') && a.length > 100) {
          return '{mcp-config...}';
        }
        return a;
      });
      await onLog('stdout', `[MonkAgents] Executing: ${command} ${argsDisplay.join(' ')}\n`);

      const proc = await this.runChildProcess(runId, command, args, {
        cwd: context.workingDirectory,
        env,
        timeoutSec,
        graceSec,
        stdin: context.prompt,
        onLog,
        onSpawn,
        // Parse streaming events and call onEvent callback
        onStdout: (chunk: string) => {
          if (ctx.onEvent) {
            const events = streamParser.parseChunk(chunk);
            for (const event of events) {
              ctx.onEvent(event);
            }
          }
        },
      });

      // Flush any remaining events
      if (ctx.onEvent) {
        const remainingEvents = streamParser.flush();
        for (const event of remainingEvents) {
          ctx.onEvent(event);
        }
      }

      const parsedStream = parseClaudeStreamJson(proc.stdout);
      const parsed = parsedStream.resultJson ?? parseJson(proc.stdout);

      return { proc, parsedStream, parsed, streamParser };
    };

    // Convert to result
    const toResult = (
      attempt: {
        proc: RunProcessResult;
        parsedStream: ReturnType<typeof parseClaudeStreamJson>;
        parsed: Record<string, unknown> | null;
      },
      opts: { fallbackSessionId: string | null; clearSessionOnMissing?: boolean },
    ): AdapterExecutionResult => {
      const { proc, parsedStream, parsed } = attempt;
      const loginMeta = detectClaudeLoginRequired({
        parsed,
        stdout: proc.stdout,
        stderr: proc.stderr,
      });

      if (proc.timedOut) {
        return {
          exitCode: proc.exitCode,
          signal: proc.signal,
          timedOut: true,
          errorMessage: `Timed out after ${timeoutSec}s`,
          errorCode: 'timeout',
          clearSession: Boolean(opts.clearSessionOnMissing),
        };
      }

      if (!parsed) {
        return {
          exitCode: proc.exitCode,
          signal: proc.signal,
          timedOut: false,
          errorMessage: parseFallbackErrorMessage(proc.exitCode, proc.stdout, proc.stderr),
          errorCode: loginMeta.requiresLogin ? 'claude_auth_required' : null,
          resultJson: { stdout: proc.stdout, stderr: proc.stderr },
          clearSession: Boolean(opts.clearSessionOnMissing),
        };
      }

      const usage: UsageSummary = parsedStream.usage ?? {
        inputTokens: asNumber(parseObject(parsed.usage).input_tokens, 0),
        cachedInputTokens: asNumber(parseObject(parsed.usage).cache_read_input_tokens, 0),
        outputTokens: asNumber(parseObject(parsed.usage).output_tokens, 0),
      };

      const resolvedSessionId =
        parsedStream.sessionId ??
        (asString(parsed.session_id, opts.fallbackSessionId ?? '') || opts.fallbackSessionId);

      const clearSessionForMaxTurns = isClaudeMaxTurnsResult(parsed);

      return {
        exitCode: proc.exitCode,
        signal: proc.signal,
        timedOut: false,
        errorMessage:
          (proc.exitCode ?? 0) === 0
            ? null
            : describeClaudeFailure(parsed) ?? `Claude exited with code ${proc.exitCode ?? -1}`,
        errorCode: loginMeta.requiresLogin ? 'claude_auth_required' : null,
        usage,
        sessionId: resolvedSessionId,
        sessionParams: resolvedSessionId
          ? {
              sessionId: resolvedSessionId,
              cwd: context.workingDirectory,
            }
          : null,
        model: parsedStream.model || asString(parsed.model, model),
        costUsd: parsedStream.costUsd ?? asNumber(parsed.total_cost_usd, 0),
        resultJson: parsed,
        summary: parsedStream.summary || asString(parsed.result, ''),
        clearSession: clearSessionForMaxTurns || Boolean(opts.clearSessionOnMissing && !resolvedSessionId),
        provider: 'anthropic',
        biller: 'anthropic',
        billingType: env.ANTHROPIC_API_KEY ? 'api' : 'subscription',
      };
    };

    // Execute with retry on invalid session
    try {
      const initial = await runAttempt(sessionId ?? null);

      // Check for invalid session error and retry without session
      if (
        sessionId &&
        !initial.proc.timedOut &&
        (initial.proc.exitCode ?? 0) !== 0 &&
        initial.parsed &&
        isClaudeUnknownSessionError(initial.parsed)
      ) {
        await onLog(
          'stdout',
          `[MonkAgents] Session "${sessionId}" is invalid, retrying with fresh session.\n`,
        );
        const retry = await runAttempt(null);
        return toResult(retry, { fallbackSessionId: null, clearSessionOnMissing: true });
      }

      return toResult(initial, { fallbackSessionId: runtimeSessionId || runtime.sessionId || null });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        exitCode: null,
        signal: null,
        timedOut: false,
        errorMessage,
        errorCode: 'execution_error',
        clearSession: false,
      };
    } finally {
      // Cleanup ephemeral skills directory
      if (skillsDir) {
        try {
          await fs.promises.rm(skillsDir, { recursive: true, force: true });
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    }
  }
}