/**
 * Tool Result Collector
 * Collects tool execution results from CLI output
 * Used to extract file changes and outputs for execution summary
 */

import { FileChange, OutputItem } from '@monkagents/shared';

/**
 * Tool use record
 */
interface ToolUseRecord {
  toolName: string;
  input: Record<string, unknown>;
  result?: unknown;
  timestamp: Date;
}

/**
 * Tool result collector
 * Collects tool execution results and extracts file changes
 */
export class ToolResultCollector {
  private toolUses: ToolUseRecord[] = [];

  /**
   * Add a tool use event
   */
  addToolUse(toolName: string, input: Record<string, unknown>): void {
    this.toolUses.push({
      toolName,
      input,
      timestamp: new Date(),
    });
  }

  /**
   * Add a tool result event
   */
  addToolResult(result: unknown): void {
    // Associate result with the most recent tool use
    if (this.toolUses.length > 0) {
      const lastTool = this.toolUses[this.toolUses.length - 1];
      if (!lastTool.result) {
        lastTool.result = result;
      }
    }
  }

  /**
   * Reset collector state
   */
  reset(): void {
    this.toolUses = [];
  }

  /**
   * Extract file changes from tool results
   */
  extractFileChanges(): FileChange[] {
    const changes: FileChange[] = [];

    for (const toolUse of this.toolUses) {
      switch (toolUse.toolName) {
        case 'Write':
          const writePath = (toolUse.input.file_path as string) || '';
          if (writePath) {
            changes.push({
              path: writePath,
              action: 'created',
              summary: `Created file via Write tool`,
            });
          }
          break;

        case 'Edit':
          const editPath = (toolUse.input.file_path as string) || '';
          if (editPath) {
            changes.push({
              path: editPath,
              action: 'modified',
              summary: `Modified via Edit tool`,
            });
          }
          break;

        case 'Bash':
          const command = (toolUse.input.command as string) || '';
          // Check for file-related commands
          if (command.includes('git ')) {
            // Extract git-related file changes if possible
            // For now, just note that git was used
          }
          break;
      }
    }

    // Deduplicate by path
    const uniqueChanges = new Map<string, FileChange>();
    for (const change of changes) {
      if (!uniqueChanges.has(change.path)) {
        uniqueChanges.set(change.path, change);
      }
    }

    return Array.from(uniqueChanges.values());
  }

  /**
   * Extract outputs from tool results
   */
  extractOutputs(): OutputItem[] {
    const outputs: OutputItem[] = [];

    for (const toolUse of this.toolUses) {
      switch (toolUse.toolName) {
        case 'Write':
          const writePath = (toolUse.input.file_path as string) || '';
          const writeContent = (toolUse.input.content as string) || '';
          if (writePath) {
            outputs.push({
              type: 'file',
              description: `Created file: ${writePath}`,
              filePath: writePath,
              value: writeContent.length > 100
                ? writeContent.substring(0, 100) + '...'
                : writeContent,
            });
          }
          break;

        case 'Edit':
          const editPath = (toolUse.input.file_path as string) || '';
          if (editPath) {
            outputs.push({
              type: 'file',
              description: `Modified file: ${editPath}`,
              filePath: editPath,
            });
          }
          break;

        case 'Bash':
          const command = (toolUse.input.command as string) || '';
          if (command) {
            outputs.push({
              type: 'command',
              description: `Executed: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`,
              value: command,
            });
          }
          break;
      }
    }

    return outputs;
  }

  /**
   * Get all tool uses for debugging
   */
  getToolUses(): ToolUseRecord[] {
    return [...this.toolUses];
  }
}