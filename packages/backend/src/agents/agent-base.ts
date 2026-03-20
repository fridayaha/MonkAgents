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
      const { command, args } = this.config.cli;

      this.logger.debug(`Executing CLI: ${command} ${args.join(' ')}`);
      this.status = 'executing';

      const processArgs = [...args, prompt];
      this.currentProcess = spawn(command, processArgs, {
        cwd: this.workingDirectory,
        shell: true,
      });

      let output = '';
      let error = '';

      this.currentProcess.stdout?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        this.logger.debug(`CLI output: ${chunk}`);
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