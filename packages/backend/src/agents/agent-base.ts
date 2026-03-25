import { Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { AgentConfig, AgentStatus, AgentState } from '@monkagents/shared';

export interface AgentExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
}

export abstract class AgentBase {
  protected readonly logger: Logger;
  protected config: AgentConfig;
  protected status: AgentStatus = 'idle';
  protected currentProcess: ChildProcess | null = null;
  protected workingDirectory: string = process.cwd();

  constructor(config: AgentConfig) {
    this.config = config;
    this.logger = new Logger(`${config.name}Agent`);
  }

  getConfig(): AgentConfig {
    return this.config;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  getState(): AgentState {
    return {
      id: this.config.id,
      config: this.config,
      status: this.status,
      lastActivity: new Date(),
    };
  }

  setWorkingDirectory(directory: string): void {
    this.workingDirectory = directory;
  }

  // Abstract methods to be implemented by subclasses
  abstract analyze(prompt: string): Promise<string>;
  abstract execute(task: string): Promise<AgentExecutionResult>;

  // CLI execution helper (to be implemented in phase 2)
  protected async executeCli(prompt: string): Promise<AgentExecutionResult> {
    return new Promise((resolve, reject) => {
      // Determine the correct claude executable path
      let actualCommand = this.config.cli.command;
      if (process.platform === 'win32' && actualCommand === 'claude') {
        // On Windows, prefer the official installation path (.local/bin/claude.exe)
        const localBin = require('path').join(process.env.USERPROFILE || '', '.local', 'bin', 'claude.exe');
        const npmClaude = require('path').join(process.env.APPDATA || '', 'npm', 'claude.cmd');

        // Check which one exists
        const fs = require('fs');
        if (fs.existsSync(localBin)) {
          actualCommand = localBin;
        } else if (fs.existsSync(npmClaude)) {
          actualCommand = npmClaude;
        }
      }

      this.status = 'executing';

      // Prepare environment
      const env: Record<string, string> = {};
      Object.keys(process.env).forEach(key => {
        if (!key.startsWith('CLAUDECODE') && !key.startsWith('CLAUDE_CODE')) {
          env[key] = process.env[key] || '';
        }
      });

      const processArgs = [...this.config.cli.args, prompt];
      this.currentProcess = spawn(actualCommand, processArgs, {
        cwd: this.workingDirectory,
        env,
        shell: false,  // Don't use shell when we have the exact path
      });

      let output = '';
      let error = '';

      this.currentProcess.stdout?.on('data', (data) => {
        output += data.toString();
      });

      this.currentProcess.stderr?.on('data', (data) => {
        error += data.toString();
        this.logger.warn(`CLI stderr: ${data.toString()}`);
      });

      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;
        this.status = 'idle';

        if (code === 0) {
          resolve({
            success: true,
            output,
          });
        } else {
          resolve({
            success: false,
            error: error || `Process exited with code ${code}`,
          });
        }
      });

      this.currentProcess.on('error', (err) => {
        this.currentProcess = null;
        this.status = 'idle';
        reject(err);
      });
    });
  }

  // Cancel current execution
  cancel(): void {
    if (this.currentProcess) {
      this.logger.log('Cancelling current execution');
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
      this.status = 'idle';
    }
  }

  // Check if agent is available
  isAvailable(): boolean {
    return this.status === 'idle';
  }

  // Get persona for prompt
  getPersonaPrompt(): string {
    return this.config.persona;
  }
}