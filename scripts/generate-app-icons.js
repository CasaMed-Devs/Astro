const path = require('path');
const { Jimp } = require('jimp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets/images/logo-source.png');
const OUT = path.join(ROOT, 'assets/images');

const CREAM_BG = 0xfefcf3ff;

async function squareOnBackground(image, size, bg) {
  const canvas = new Jimp({ width: size, height: size, color: bg });
  const resized = image.clone().contain({ w: Math.round(size * 0.72), h: Math.round(size * 0.72) });
  const x = Math.round((size - resized.bitmap.width) / 2);
  const y = Math.round((size - resized.bitmap.height) / 2);
  canvas.composite(resized, x, y);
  return canvas;
}

async function main() {
  const logo = await Jimp.read(SRC);

  const icon = await squareOnBackground(logo, 1024, CREAM_BG);
  await icon.write(path.join(OUT, 'icon.png'));

  const splash = await squareOnBackground(logo, 1024, CREAM_BG);
  await splash.write(path.join(OUT, 'splash-icon.png'));

  const adaptiveFg = new Jimp({ width: 1024, height: 1024, color: 0x00000000 });
  const fgLogo = logo.clone().contain({ w: 640, h: 640 });
  adaptiveFg.composite(
    fgLogo,
    Math.round((1024 - fgLogo.bitmap.width) / 2),
    Math.round((1024 - fgLogo.bitmap.height) / 2),
  );
  await adaptiveFg.write(path.join(OUT, 'android-icon-foreground.png'));

  const favicon = await squareOnBackground(logo, 196, CREAM_BG);
  await favicon.write(path.join(OUT, 'favicon.png'));

  console.log('Generated icon.png, splash-icon.png, android-icon-foreground.png, favicon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
