const shareLogoUrl = new URL('./logo-lockup.jpg', import.meta.url).href;

export function loadImage(src) {
  if (!src) return Promise.resolve(null);

  return new Promise(resolve => {
    const image = new Image();
    const timer = setTimeout(() => resolve(null), 5000);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = src;
  });
}

export async function loadShareLogo() {
  return await loadImage(shareLogoUrl) ?? document.querySelector('.brand-mark');
}
