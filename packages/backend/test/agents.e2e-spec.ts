import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsModule } from '../src/agents/agents.module';
import { ConfigModule } from '../src/config/config.module';
import { DatabaseModule } from '../src/database/database.module';

describe('AgentsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        ConfigModule,
        AgentsModule,
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [__dirname + '/../src/database/entities/*.entity.ts'],
          synchronize: true,
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/api/agents (GET)', () => {
    it('should return agents list', () => {
      return request(app.getHttpServer())
        .get('/api/agents')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('/api/agents/:id (GET)', () => {
    it('should return 404 for non-existent agent', () => {
      return request(app.getHttpServer())
        .get('/api/agents/non-existent')
        .expect(404);
    });
  });
});