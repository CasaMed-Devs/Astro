const path = require('path');
const { Jimp } = require('jimp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets/images/android-icon-foreground.png');
const RES = path.join(ROOT, 'android/app/src/main/res');

const SIZES = {
  'drawable-mdpi': 288,
  'drawable-hdpi': 432,
  'drawable-xhdpi': 576,
  'drawable-xxhdpi': 864,
  'drawable-xxxhdpi': 1152,
};

async function main() {
  const logo = await Jimp.read(SRC);

  for (const [dir, size] of Object.entries(SIZES)) {
    const resized = logo.clone().resize({ w: size, h: size });
    const out = path.join(RES, dir, 'splashscreen_logo.png');
    await resized.write(out);
    console.log(`Wrote ${out} (${size}x${size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
