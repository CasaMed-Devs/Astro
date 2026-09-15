const path = require('path');
const { Jimp } = require('jimp');

const DIR = path.resolve(__dirname, '../assets/images/personas');
const FILES = [
  'ramesh-shastri.png',
  'meera-iyer.png',
  'arjun-dev.png',
  'savitri-devi.png',
  'nikhil-joshi.png',
  'kavita-nair.png',
];

async function main() {
  for (const file of FILES) {
    const filePath = path.join(DIR, file);
    const image = await Jimp.read(filePath);
    image.cover({ w: 300, h: 300 });
    await image.write(filePath);
    console.log('Resized', file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
