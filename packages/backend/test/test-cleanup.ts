/**
 * 测试数据清理工具
 * 用于手动清理测试数据库和 Redis
 *
 * ⚠️ 只清理测试数据库，不影响生产环境
 */

import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

interface TestCleanupConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
  };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
}

// 生产数据库名称列表（禁止清理）
const PROD_DATABASES = ['monkagents', 'monkagents_prod', 'production'];

/**
 * 加载测试配置
 * 优先使用 system.test.yaml
 */
function loadTestConfig(): TestCleanupConfig {
  const configPaths = [
    join(process.cwd(), 'configs', 'system.test.yaml'),
    join(process.cwd(), '..', '..', 'configs', 'system.test.yaml'),
  ];

  let config: any = {};

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      config = parse(content);
      console.log(`📝 加载测试配置: ${configPath}`);
      break;
    }
  }

  // 默认使用测试环境配置
  return {
    redis: {
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.db ?? 1, // 默认 Redis db 1
      keyPrefix: config.redis?.keyPrefix || 'monkagents_test:',
    },
    database: {
      host: config.database?.host || 'localhost',
      port: config.database?.port || 3306,
      username: config.database?.username || 'root',
      password: config.database?.password || 'root',
      database: config.database?.database || 'monkagents_test', // 默认测试数据库
    },
  };
}

/**
 * 安全检查：验证是否为测试数据库
 */
function validateTestDatabase(database: string): boolean {
  if (PROD_DATABASES.includes(database.toLowerCase())) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ❌ 安全检查失败：禁止清理生产数据库！                       ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error(`║  当前数据库: ${database.padEnd(48)}║`);
    console.error('║                                                              ║');
    console.error('║  测试清理只能作用于测试数据库（如 monkagents_test）          ║');
    console.error('║  请检查 configs/system.test.yaml 配置                       ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    return false;
  }
  return true;
}

/**
 * 清理 Redis 测试数据
 */
async function cleanupRedis(config: TestCleanupConfig['redis']): Promise<void> {
  const logger = new Logger('TestCleanup:Redis');

  try {
    const client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
    });

    await client.connect();

    // 清空当前测试数据库（FLUSHDB 只清空当前 db）
    await client.flushdb();
    logger.log(`✅ 已清空测试 Redis 数据库 (db: ${config.db})`);

    await client.quit();
  } catch (error) {
    logger.warn(`Redis 清理失败: ${error}`);
  }
}

/**
 * 清理数据库测试数据
 */
async function cleanupDatabase(config: TestCleanupConfig['database']): Promise<void> {
  const logger = new Logger('TestCleanup:Database');

  // 安全检查
  if (!validateTestDatabase(config.database)) {
    return;
  }

  const dataSource = new DataSource({
    type: 'mysql',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
  });

  try {
    await dataSource.initialize();
    logger.log(`🧹 清理测试数据库: ${config.database}`);

    // 清理各个表的数据（保留表结构）
    const tables = [
      'execution_logs',
      'checkpoints',
      'scheduled_tasks',
      'conversations',
      'subtasks',
      'tasks',
      'agents',
      'sessions',
    ];

    // 禁用外键检查
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');

    for (const table of tables) {
      try {
        const result = await dataSource.query(`DELETE FROM ${table}`);
        if (result.affectedRows > 0) {
          logger.log(`  - 清理 ${table}: ${result.affectedRows} 行`);
        }
        // 重置自增 ID
        await dataSource.query(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);
      } catch {
        // 表可能不存在，忽略
      }
    }

    // 重新启用外键检查
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');

    await dataSource.destroy();
    logger.log('✅ 测试数据库清理完成');
  } catch (error) {
    logger.warn(`数据库清理失败: ${error}`);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

/**
 * 执行完整的测试数据清理
 */
export async function cleanupTestData(): Promise<void> {
  const logger = new Logger('TestCleanup');
  logger.log('开始清理测试数据...');

  const config = loadTestConfig();

  // 安全检查
  if (!validateTestDatabase(config.database.database)) {
    return;
  }

  console.log(`📦 目标数据库: ${config.database.database}`);
  console.log(`📦 目标 Redis DB: ${config.redis.db}`);

  // 并行清理 Redis 和数据库
  await Promise.all([
    cleanupRedis(config.redis),
    cleanupDatabase(config.database),
  ]);

  logger.log('测试数据清理完成');
}

/**
 * 仅清理 Redis 测试数据
 */
export async function cleanupRedisOnly(): Promise<void> {
  const config = loadTestConfig();
  await cleanupRedis(config.redis);
}

/**
 * 仅清理数据库测试数据
 */
export async function cleanupDatabaseOnly(): Promise<void> {
  const config = loadTestConfig();
  if (validateTestDatabase(config.database.database)) {
    await cleanupDatabase(config.database);
  }
}

// 直接运行时执行清理
if (require.main === module) {
  cleanupTestData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}