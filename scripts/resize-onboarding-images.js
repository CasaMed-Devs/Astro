const path = require('path');
const { Jimp } = require('jimp');

const DIR = path.resolve(__dirname, '../assets/images/onboarding');
const FILES = ['stars-decoded.png', 'pick-skill.png', 'ask-anything.png'];

async function main() {
  for (const file of FILES) {
    const filePath = path.join(DIR, file);
    const image = await Jimp.read(filePath);
    image.resize({ w: 780 });
    await image.write(filePath);
    console.log('Resized', file);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
