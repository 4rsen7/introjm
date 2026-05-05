const PADDLE_SCRIPT_SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js';
const DEFAULT_ENVIRONMENT = 'production';

let paddleLoadPromise = null;
let initializedToken = null;
let initializedEnvironment = null;

function appendPaddleScript() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Paddle can only be loaded in the browser.'));
      return;
    }

    if (window.Paddle) {
      resolve(window.Paddle);
      return;
    }

    const existing = document.querySelector(`script[src="${PADDLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Paddle), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Paddle.js.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = PADDLE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(window.Paddle);
    script.onerror = () => reject(new Error('Failed to load Paddle.js.'));
    document.head.appendChild(script);
  });
}

export async function getPaddle({ clientToken, environment = DEFAULT_ENVIRONMENT } = {}) {
  if (!clientToken) {
    throw new Error('Paddle client token is not configured.');
  }

  if (!paddleLoadPromise) {
    paddleLoadPromise = appendPaddleScript();
  }

  const Paddle = await paddleLoadPromise;

  if (!Paddle) {
    throw new Error('Paddle.js is unavailable.');
  }

  if (environment === 'sandbox' && Paddle.Environment?.set) {
    Paddle.Environment.set('sandbox');
  }

  if (initializedToken !== clientToken || initializedEnvironment !== environment) {
    Paddle.Initialize({
      token: clientToken,
    });
    initializedToken = clientToken;
    initializedEnvironment = environment;
  }

  return Paddle;
}
