import { expect, it, vi } from 'vitest';
import { waitForSize } from './element-size';

it('uses observer geometry without reading layout getters and releases the observer', async () => {
  const element={get clientWidth(){throw Error('forced layout');},get clientHeight(){throw Error('forced layout');}};
  let notify;const disconnect=vi.fn(),clearTimeout=vi.fn();
  const environment={ResizeObserver:class {constructor(callback){notify=callback;}observe(){}disconnect=disconnect;},setTimeout:()=>1,clearTimeout};
  const result=waitForSize(element,1800,environment);
  notify([{target:{},contentRect:{width:900,height:600}}]);
  expect(disconnect).not.toHaveBeenCalled();
  notify([{target:element,contentRect:{width:0,height:300}}]);
  expect(disconnect).not.toHaveBeenCalled();
  notify([{target:element,contentRect:{width:640.2,height:319.8}}]);
  expect(await result).toEqual({width:640,height:320});
  expect(disconnect).toHaveBeenCalledTimes(1);expect(clearTimeout).toHaveBeenCalledWith(1);
});
it('expires hidden elements without returning a zero-size drawing and releases resources', async () => {
  let expire;const disconnect=vi.fn();
  const environment={ResizeObserver:class {observe(){}disconnect=disconnect;},setTimeout:callback=>{expire=callback;return 1;},clearTimeout:()=>{}};
  const result=waitForSize({},10,environment);expire();expect(await result).toBeNull();expect(disconnect).toHaveBeenCalledTimes(1);
});
