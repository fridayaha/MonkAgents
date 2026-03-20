# Docker 部署配置

本目录包含 MonkAgents 的 Docker 部署相关文件。

## 文件列表

```
docker/
├── Dockerfile           # 应用镜像
├── docker-compose.yml   # 编排配置
└── nginx.conf           # Nginx 配置（可选）
```

## 快速开始

### 构建镜像

```bash
# 在项目根目录执行
docker build -t monkagents:latest -f docker/Dockerfile .
```

### 运行容器

```bash
docker run -d \
  --name monkagents \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs:/app/configs \
  monkagents:latest
```

### 使用 Docker Compose

```bash
docker-compose -f docker/docker-compose.yml up -d
```

## Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/backend/package*.json ./packages/backend/
RUN npm ci --only=production

# 复制源代码
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
COPY configs ./configs

# 构建
RUN npm run build -w @monkagents/shared
RUN npm run build -w @monkagents/backend

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "packages/backend/dist/main.js"]
```

## Docker Compose 配置

```yaml
version: '3.8'

services:
  monkagents:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - ../data:/app/data
      - ../configs:/app/configs
    environment:
      - NODE_ENV=production
      - PORT=3000
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

## 环境变量

| 变量名 | 默认值 | 描述 |
|--------|--------|------|
| NODE_ENV | development | 运行环境 |
| PORT | 3000 | 服务端口 |
| DATABASE_PATH | ./data/sqlite/monkagents.db | 数据库路径 |
| LOG_LEVEL | info | 日志级别 |

## 生产部署建议

### 资源配置

```yaml
services:
  monkagents:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### 健康检查

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### 日志管理

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## Nginx 反向代理

```nginx
upstream monkagents {
    server monkagents:3000;
}

server {
    listen 80;
    server_name localhost;

    location / {
        proxy_pass http://monkagents;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /socket.io {
        proxy_pass http://monkagents;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 监控

推荐使用以下工具监控容器：

- Prometheus + Grafana
- ELK Stack
- Datadog

## 备份策略

```bash
# 备份数据目录
docker exec monkagents tar czf /tmp/backup.tar.gz /app/data
docker cp monkagents:/tmp/backup.tar.gz ./backup-$(date +%Y%m%d).tar.gz
```