export const nextFrame = () => new Promise(r => window.requestAnimationFrame(() => window.requestAnimationFrame(r)));
