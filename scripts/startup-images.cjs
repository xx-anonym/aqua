/**
 * Renders the iOS startup images (public/splash/*.png) from the start screen in index.html and
 * writes the matching <link rel="apple-touch-startup-image"> tags into index.html.
 *
 * iOS shows the startup image while a home-screen web app launches; without one it shows a
 * black or white screen. Each image is the first frame of the animated start screen, so the
 * launch hands over to the animation without a visible jump.
 *
 * Run after changing the start screen:  node scripts/startup-images.cjs
 * Needs Playwright with Chromium (not a project dependency).
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const OUT_DIR = path.join(ROOT, 'public', 'splash');
const START = '<!-- startup-images:start -->';
const END = '<!-- startup-images:end -->';

// Portrait iPhone screens: CSS width × height @ pixel ratio.
const DEVICES = [
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [420, 912, 3], // Air
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [430, 932, 3], // 14 Pro Max, 15 Plus / Pro Max, 16 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [428, 926, 3], // 12 / 13 Pro Max, 14 Plus
  [390, 844, 3], // 12, 13, 14, 16e
  [375, 812, 3], // X, XS, 11 Pro, 12 / 13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [414, 736, 3], // 6–8 Plus
  [375, 667, 2], // 6–8, SE 2nd/3rd gen
];

(async () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  if (!html.includes(START) || !html.includes(END)) throw new Error('index.html lacks the startup-images markers');
  // Only the start screen is needed: drop the app script.
  const page0 = html.replace(/<script type="module"[^>]*><\/script>/, '');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const links = [];
  for (const [w, h, r] of DEVICES) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: r });
    await page.setContent(page0, { waitUntil: 'load' });
    await page.evaluate(() => {
      document.getAnimations().forEach((a) => {
        a.pause();
        a.currentTime = 0;
      });
      // Same radial gradient as the CSS background, computed per device pixel without the
      // dithering noise of the browser's gradients: keeps the PNG files small.
      const splash = document.getElementById('splash');
      const W = Math.round(innerWidth * devicePixelRatio);
      const H = Math.round(innerHeight * devicePixelRatio);
      const stops = [
        [0, [0x0e, 0x7f, 0x87]],
        [0.55, [0x08, 0x46, 0x4d]],
        [1, [0x04, 0x25, 0x2b]],
      ];
      const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(W, H);
      const rx = 1.3 * W, ry = 0.9 * H, cx = 0.5 * W, cy = 0.35 * H;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const t = Math.min(1, Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry));
          const i = t <= stops[1][0] ? 0 : 1;
          const [t0, c0] = stops[i];
          const [t1, c1] = stops[i + 1];
          const f = (t - t0) / (t1 - t0);
          const o = (y * W + x) * 4;
          for (let k = 0; k < 3; k++) img.data[o + k] = Math.round(c0[k] + (c1[k] - c0[k]) * f);
          img.data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      splash.style.background = `url(${canvas.toDataURL()}) 0 0 / 100% 100%`;
    });
    await page.waitForTimeout(100);
    const file = `iphone-${w * r}x${h * r}.png`;
    await page.screenshot({ path: path.join(OUT_DIR, file) });
    await page.close();
    links.push(
      `    <link rel="apple-touch-startup-image" href="/splash/${file}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" />`,
    );
    console.log(file, Math.round(fs.statSync(path.join(OUT_DIR, file)).size / 1024), 'KB');
  }
  await browser.close();

  const block = `${START}\n${links.join('\n')}\n    ${END}`;
  const next = html.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
  fs.writeFileSync(INDEX, next);
})();
