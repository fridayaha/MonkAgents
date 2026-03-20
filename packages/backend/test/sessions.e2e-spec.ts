import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionModule } from '../src/session/session.module';
import { ConfigModule } from '../src/config/config.module';
import { DatabaseModule } from '../src/database/database.module';

describe('SessionsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        ConfigModule,
        SessionModule,
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
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/api/sessions (POST)', () => {
    it('should create a new session', () => {
      return request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          workingDirectory: '/test/path',
          title: 'Test Session',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.workingDirectory).toBe('/test/path');
          expect(res.body.title).toBe('Test Session');
          expect(res.body.status).toBe('active');
        });
    });

    it('should create session without title', () => {
      return request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          workingDirectory: '/test/path',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.workingDirectory).toBe('/test/path');
        });
    });

    it('should fail without workingDirectory', () => {
      return request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          title: 'Test Session',
        })
        .expect(400);
    });
  });

  describe('/api/sessions (GET)', () => {
    it('should return empty array initially', () => {
      return request(app.getHttpServer())
        .get('/api/sessions')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should return created sessions', async () => {
      // Create a session first
      await request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          workingDirectory: '/test/path1',
          title: 'Session 1',
        });

      await request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          workingDirectory: '/test/path2',
          title: 'Session 2',
        });

      return request(app.getHttpServer())
        .get('/api/sessions')
        .expect(200)
        .expect((res) => {
          expect(res.body.length).toBeGreaterThanOrEqual(2);
        });
    });
  });

  describe('/api/sessions/:id (GET)', () => {
    let sessionId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          workingDirectory: '/test/path',
          title: 'Test Session',
        });
      sessionId = res.body.id;
    });

    it('should return session by id', () => {
      return request(app.getHttpServer())
        .get(`/api/sessions/${sessionId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(sessionId);
          expect(res.body.title).toBe('Test Session');
          expect(res.body.messages).toBeDefined();
          expect(res.body.tasks).toBeDefined();
        });
    });

    it('should return 404 for non-existent session', () => {
      return request(app.getHttpServer())
        .get('/api/sessions/non-existent-id')
        .expect(404);
    });
  });

  describe('/api/sessions/:id (DELETE)', () => {
    let sessionId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/sessions')
        .send({
          workingDirectory: '/test/path',
        });
      sessionId = res.body.id;
    });

    it('should delete session', () => {
      return request(app.getHttpServer())
        .delete(`/api/sessions/${sessionId}`)
        .expect(204);
    });

    it('should return 404 after deletion', async () => {
      await request(app.getHttpServer())
        .delete(`/api/sessions/${sessionId}`)
        .expect(204);

      return request(app.getHttpServer())
        .get(`/api/sessions/${sessionId}`)
        .expect(404);
    });

    it('should return 404 for non-existent session', () => {
      return request(app.getHttpServer())
        .delete('/api/sessions/non-existent-id')
        .expect(404);
    });
  });
});