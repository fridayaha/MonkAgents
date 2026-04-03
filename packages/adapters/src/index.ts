/**
 * MonkAgents Adapters
 * CLI adapters for multi-agent execution
 */

// Types
export * from './types';

// Base class and utilities
export { BaseAdapter, runningProcesses } from './base';
export * from './base';

// Registry
export { AdapterRegistry, getAdapter } from './registry';

// Built-in adapters
export { ClaudeLocalAdapter, ClaudeStreamParser } from './claude-local';