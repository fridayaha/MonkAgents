/**
 * Adapter Registry
 * Manages available CLI adapters
 */

import { Adapter } from './types';

/**
 * Built-in adapters
 */
import { ClaudeLocalAdapter } from './claude-local';

/**
 * Adapter registry singleton
 */
class AdapterRegistryImpl {
  private adapters: Map<string, Adapter> = new Map();

  constructor() {
    // Register built-in adapters
    this.register(new ClaudeLocalAdapter());
  }

  /**
   * Register an adapter
   */
  register(adapter: Adapter): void {
    if (this.adapters.has(adapter.type)) {
      console.warn(`Adapter "${adapter.type}" already registered, overwriting`);
    }
    this.adapters.set(adapter.type, adapter);
  }

  /**
   * Get an adapter by type
   */
  get(type: string): Adapter | undefined {
    return this.adapters.get(type);
  }

  /**
   * Check if adapter exists
   */
  has(type: string): boolean {
    return this.adapters.has(type);
  }

  /**
   * Get all registered adapters
   */
  getAll(): Adapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get all adapter types
   */
  getTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}

/**
 * Global adapter registry instance
 */
export const AdapterRegistry = new AdapterRegistryImpl();

/**
 * Get adapter by type
 */
export function getAdapter(type: string): Adapter {
  const adapter = AdapterRegistry.get(type);
  if (!adapter) {
    throw new Error(`Adapter "${type}" not found. Available: ${AdapterRegistry.getTypes().join(', ')}`);
  }
  return adapter;
}