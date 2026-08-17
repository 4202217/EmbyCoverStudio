const cache = new Map<string, string | null>();

export async function dominantColor(src: string): Promise<string | null> {
  const cached = cache.get(src);
  if (cached !== undefined) return cached;
  try {
    const color = await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const size = 12;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, size, size);
          const { data } = ctx.getImageData(0, 0, size, size);
          let r = 0;
          let g = 0;
          let b = 0;
          let n = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 125) continue;
            const R = data[i];
            const G = data[i + 1];
            const B = data[i + 2];
            const max = Math.max(R, G, B);
            const min = Math.min(R, G, B);
            const sat = max === 0 ? 0 : (max - min) / max;
            if (sat < 0.08) continue;
            r += R;
            g += G;
            b += B;
            n += 1;
          }
          if (n === 0) {
            r = data[0];
            g = data[1];
            b = data[2];
            n = 1;
          }
          resolve(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
    cache.set(src, color);
    return color;
  } catch {
    return null;
  }
}
