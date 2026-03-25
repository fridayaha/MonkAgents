# 八次方技术官网

这是八次方技术博客的宣传网站，使用纯前端技术构建。

## 文件结构

```
website/
├── index.html           # 主页面
├── assets/
│   ├── css/
│   │   └── style.css    # 样式文件
│   ├── js/
│   │   └── main.js      # 交互脚本
│   └── images/
│       └── favicon.svg  # 网站图标
├── nginx.conf           # Nginx 配置示例
└── README.md
```

## 本地预览

直接在浏览器中打开 `index.html` 文件即可预览。

或使用本地服务器：

```bash
# 使用 Python
python -m http.server 8080

# 使用 Node.js
npx serve .

# 使用 PHP
php -S localhost:8080
```

## 部署到 Nginx

### 1. 上传文件

将 `website/` 目录下的所有文件上传到服务器，例如 `/var/www/pow8.cn/`

```bash
scp -r website/* user@server:/var/www/pow8.cn/
```

### 2. 配置 Nginx

创建或修改 Nginx 配置文件：

```bash
sudo nano /etc/nginx/sites-available/pow8.cn
```

内容参见 `nginx.conf` 文件。

### 3. 启用站点

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/pow8.cn /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

### 4. 配置 SSL (推荐)

使用 Let's Encrypt 免费证书：

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d pow8.cn -d www.pow8.cn

# 自动续期
sudo certbot renew --dry-run
```

## 自定义修改

### 修改备案信息

编辑 `index.html` 文件底部的备案信息：

```html
<p class="icp">
    <a href="https://beian.miit.gov.cn/" target="_blank">京ICP备XXXXXXXX号-1</a>
    <span class="divider">|</span>
    <a href="http://www.beian.gov.cn/" target="_blank">京公网安备 XXXXXXXXXXX号</a>
</p>
```

### 修改 GitHub 链接

全局搜索并替换 `https://github.com/your-repo/monkagents` 为实际的 GitHub 仓库地址。

### 添加统计代码

在 `index.html` 的 `</head>` 前添加统计代码（如百度统计、Google Analytics）。

## 浏览器兼容性

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 性能优化建议

1. **图片优化**: 使用 WebP 格式，添加图片压缩
2. **代码压缩**: 使用工具压缩 CSS/JS 文件
3. **CDN 加速**: 将静态资源部署到 CDN
4. **Gzip 压缩**: 在 Nginx 中启用 Gzip
5. **浏览器缓存**: 配置合理的缓存策略

## 更新日志

- 2024-03-24: 初始版本发布