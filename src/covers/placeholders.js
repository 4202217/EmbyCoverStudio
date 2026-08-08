import sharp from 'sharp';

const PALETTE = [
  ['#e74c3c', '#5b1a14'],
  ['#3498db', '#123a5e'],
  ['#2ecc71', '#145a32'],
  ['#f39c12', '#6e5508'],
  ['#9b59b6', '#3d1f52'],
  ['#1abc9c', '#0e4d45'],
  ['#e67e22', '#5c2508'],
  ['#34495e', '#111a24'],
  ['#c0392b', '#571b15']
];

export async function placeholderPoster(label, index = 0, w = 300, h = 450) {
  const [top, bottom] = PALETTE[index % PALETTE.length];
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${top}"/>` +
      `<stop offset="1" stop-color="${bottom}"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/>` +
      `<circle cx="${w * 0.5}" cy="${h * 0.42}" r="${w * 0.24}" fill="rgba(255,255,255,0.12)"/>` +
      `<text x="50%" y="${h * 0.5}" font-family="sans-serif" font-size="${w * 0.09}" font-weight="bold" fill="rgba(255,255,255,0.92)" text-anchor="middle">${label}</text>` +
      `</svg>`
  );
  return sharp(svg).png().toBuffer();
}
