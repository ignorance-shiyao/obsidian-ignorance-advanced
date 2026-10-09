import { describe, expect, it, vi } from 'vitest';
import { waitForStableLayout } from './layout-stability';
describe('first-screen layout stabilization', () => {
  it('waits for consecutive rendered frames and resets after geometry changes', async () => {
    const heights = [100, 100, 130, 130, 130]; let index = 0;
    const frame = vi.fn(async () => { index++; });
    expect(await waitForStableLayout(() => heights[index], { frame })).toBe(true);
    expect(frame).toHaveBeenCalledTimes(4);
  });
  it('bounds continuously changing layouts', async () => {
    let height = 0;
    expect(await waitForStableLayout(() => height++, { frame: async () => {}, frames: 3 })).toBe(false);
  });
  it('stops immediately when the render is cancelled', async () => {
    const controller = new AbortController();
    const read = vi.fn(() => 100);
    await expect(waitForStableLayout(read, { signal: controller.signal, frame: async () => controller.abort() })).rejects.toThrow();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
