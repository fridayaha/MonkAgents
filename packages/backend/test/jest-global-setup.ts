/**
 * Jest 全局设置 - 在所有测试开始前执行
 * 1. 加载测试环境配置
 * 2. 创建测试数据库（如果不存在）
 * 3. 同步数据库结构
 */

import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

interface TestConfig {
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    keyPrefix: string;
  };
}

function loadTestConfig(): TestConfig {
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

  // 测试环境使用独立数据库和 Redis
  return {
    database: {
      host: config.database?.host || 'localhost',
      port: config.database?.port || 3306,
      username: config.database?.username || 'root',
      password: config.database?.password || 'root',
      database: config.database?.database || 'monkagents_test', // 默认测试数据库
    },
    redis: {
      host: config.redis?.host || 'localhost',
      port: config.redis?.port || 6379,
      password: config.redis?.password,
      db: config.redis?.db ?? 1, // 默认使用 Redis db 1
      keyPrefix: config.redis?.keyPrefix || 'monkagents_test:',
    },
  };
}

async function ensureTestDatabase(config: TestConfig['database']): Promise<void> {
  const logger = new Logger('GlobalSetup:Database');

  // 先连接到 MySQL 服务器（不指定数据库）
  const rootDataSource = new DataSource({
    type: 'mysql',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
  });

  try {
    await rootDataSource.initialize();
    logger.log('✅ 已连接到 MySQL 服务器');

    // 检查测试数据库是否存在
    const result = await rootDataSource.query(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [config.database],
    );

    if (result.length === 0) {
      // 创建测试数据库
      await rootDataSource.query(`CREATE DATABASE \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      logger.log(`✅ 已创建测试数据库: ${config.database}`);
    } else {
      logger.log(`✅ 测试数据库已存在: ${config.database}`);
    }

    await rootDataSource.destroy();

    // 现在连接到测试数据库并同步表结构
    const testDataSource = new DataSource({
      type: 'mysql',
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      database: config.database,
      entities: [
        join(process.cwd(), 'src', 'database', 'entities', '*.entity.{ts,js}'),
        join(process.cwd(), '..', '..', 'packages', 'backend', 'src', 'database', 'entities', '*.entity.{ts,js}'),
      ],
      synchronize: true, // 测试环境自动同步表结构
    });

    await testDataSource.initialize();
    logger.log('✅ 测试数据库表结构已同步');
    await testDataSource.destroy();

  } catch (error) {
    logger.error(`测试数据库初始化失败: ${error}`);
    if (rootDataSource.isInitialized) {
      await rootDataSource.destroy();
    }
    throw error;
  }
}

async function ensureTestRedis(config: TestConfig['redis']): Promise<void> {
  const logger = new Logger('GlobalSetup:Redis');

  try {
    const client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      lazyConnect: true,
    });

    await client.connect();
    await client.ping();
    logger.log(`✅ 已连接到测试 Redis (db: ${config.db})`);

    // 清空测试 Redis 数据库（确保测试环境干净）
    await client.flushdb();
    logger.log('✅ 已清空测试 Redis 数据库');

    await client.quit();
  } catch (error) {
    logger.warn(`Redis 测试环境初始化失败: ${error}`);
    // Redis 连接失败不应该阻止测试运行
  }
}

// 导出配置供 teardown 使用
let testConfig: TestConfig | null = null;

export function getTestConfig(): TestConfig | null {
  return testConfig;
}

export default async function globalSetup() {
  console.log('🧪 全局测试设置...');

  testConfig = loadTestConfig();

  // 验证是否使用测试配置（安全检查）
  if (testConfig.database.database === 'monkagents' && !process.env.FORCE_TEST_ON_PROD) {
    console.error('❌ 错误: 测试不能使用生产数据库 "monkagents"');
    console.error('   请在 configs/system.test.yaml 中配置独立的测试数据库');
    console.error('   或设置环境变量 FORCE_TEST_ON_PROD=true 强制运行');
    process.exit(1);
  }

  console.log(`📦 测试数据库: ${testConfig.database.database}`);
  console.log(`📦 测试 Redis DB: ${testConfig.redis.db}`);

  // 并行初始化
  await Promise.all([
    ensureTestDatabase(testConfig.database),
    ensureTestRedis(testConfig.redis),
  ]);

  console.log('✅ 测试环境初始化完成');
}