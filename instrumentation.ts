export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getApp } = await import('./server/app');
    const { startBackground } = await import('./server/background');
    getApp();
    startBackground();
  }
}
