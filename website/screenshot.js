const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // 设置视口大小
    await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 2
    });

    // 加载本地 HTML 文件
    const htmlPath = path.join(__dirname, 'index.html');
    await page.goto(`file://${htmlPath}`, {
        waitUntil: 'networkidle0',
        timeout: 30000
    });

    // 等待动画加载
    await new Promise(r => setTimeout(r, 2000));

    // 截取全页面
    await page.screenshot({
        path: path.join(__dirname, 'assets/images/screenshot-full.png'),
        fullPage: true
    });

    // 截取首屏
    await page.screenshot({
        path: path.join(__dirname, 'assets/images/screenshot-hero.png'),
        clip: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080
        }
    });

    console.log('截图已保存:');
    console.log('- assets/images/screenshot-full.png (全页面)');
    console.log('- assets/images/screenshot-hero.png (首屏)');

    await browser.close();
})();