/** Shared requestAnimationFrame loop for all canvas views. */
type Fn = (now: number) => void;

const subscribers = new Set<Fn>();
let raf = 0;

function loop(now: number) {
  for (const fn of subscribers) fn(now);
  raf = subscribers.size ? requestAnimationFrame(loop) : 0;
}

export function onFrame(fn: Fn): () => void {
  subscribers.add(fn);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    subscribers.delete(fn);
  };
}

/** Sizes a canvas to its container and the pixel density. Returns true if anything changed. */
export function fitCanvas(canvas: HTMLCanvasElement, width: number, height: number): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w;
  canvas.height = h;
  return true;
}
