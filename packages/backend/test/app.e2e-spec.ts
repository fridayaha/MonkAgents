import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/api/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('ok');
          expect(res.body.timestamp).toBeDefined();
          expect(res.body.version).toBeDefined();
        });
    });
  });

  describe('/api/info (GET)', () => {
    it('should return system info', () => {
      return request(app.getHttpServer())
        .get('/api/info')
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('MonkAgents');
          expect(res.body.description).toBeDefined();
          expect(Array.isArray(res.body.agents)).toBe(true);
        });
    });
  });
});