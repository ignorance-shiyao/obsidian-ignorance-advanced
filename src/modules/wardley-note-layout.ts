import { wardleyNotePosition } from './wardley-note-position.js';

export function wardleyNoteLines(text, width, measure) {
  const tokens = text.match(/\S+\s*|\s+/g) || [];
  const lines = [];
  let start = 0, end = 0;
  for (const token of tokens) {
    const next = end + token.length;
    if (end > start && measure(start, next - start) > width) { lines.push(text.slice(start, end)); start = end; }
    end = next;
  }
  if (end > start) lines.push(text.slice(start, end));
  return lines;
}

export function restoreWardleyNotes(svg) {
  for (const label of svg.querySelectorAll('[data-ibm-wardley-note-original]')) {
    const original = JSON.parse(label.getAttribute('data-ibm-wardley-note-original'));
    label.textContent = original.text;
    for (const [key, value] of Object.entries(original.attrs)) {
      if (value === null) label.removeAttribute(key); else label.setAttribute(key, value);
    }
    label.removeAttribute('data-ibm-wardley-note-original');
  }
  svg.querySelectorAll('.ibm-wardley-note-leader,.ibm-wardley-note-card').forEach(node => node.remove());
}

export function layoutWardleyNotes(svg) {
  if (svg.hasAttribute("data-ibm-keep-layout")) return;
  const root = svg.getCTM(), background = svg.querySelector('rect.wardley-background');
  if (!root || !background) return;
  const frame = background.getBBox(), bounds = { x: frame.x + 48, y: frame.y + 48, width: frame.width - 96, height: frame.height - 96 };
  if (bounds.width < 80 || bounds.height < 80) return;
  const boxOf = element => {
    const box = element.getBBox(), matrix = root.inverse().multiply(element.getCTM());
    const first = new DOMPoint(box.x, box.y).matrixTransform(matrix), last = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(matrix);
    return { x: first.x, y: first.y, width: last.x - first.x, height: last.y - first.y };
  };
  const obstacles = [...svg.querySelectorAll('g.wardley-node, text.wardley-link-label')].map(boxOf);
  const segments = [...svg.querySelectorAll('line.wardley-link:not(.ibm-wardley-note-leader), line.wardley-trend')].map(line => {
    const matrix = root.inverse().multiply(line.getCTM());
    const first = new DOMPoint(Number(line.getAttribute('x1')), Number(line.getAttribute('y1'))).matrixTransform(matrix);
    const last = new DOMPoint(Number(line.getAttribute('x2')), Number(line.getAttribute('y2'))).matrixTransform(matrix);
    return { x1:first.x, y1:first.y, x2:last.x, y2:last.y };
  });
  const fontSize = Number(svg.querySelector('text.wardley-node-label')?.getAttribute('font-size')) || 16;
  for (const label of svg.querySelectorAll('g.wardley-notes > text')) {
    // Keep deliberate custom CSS and explicitly structured labels intact.
    if (label.children.length || label.hasAttribute("transform") || Math.abs(parseFloat(getComputedStyle(label).fontSize) - Number(label.getAttribute('font-size'))) > .1) continue;
    const original = { text: label.textContent, attrs: Object.fromEntries(['x','y','font-size','transform'].map(key => [key,label.getAttribute(key)])) };
    const x = Number(original.attrs.x), y = Number(original.attrs.y), width = Math.min(260, bounds.width);
    label.setAttribute('font-size', String(fontSize));
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d"), computed = getComputedStyle(label);
    context.font = `${computed.fontWeight} ${fontSize}px ${computed.fontFamily}`;
    const lines = wardleyNoteLines(original.text, width, (start, count) => context.measureText(original.text.slice(start, start + count)).width);
    if (!lines.length) { label.setAttribute('font-size', original.attrs['font-size']); continue; }
    label.setAttribute('data-ibm-wardley-note-original', JSON.stringify(original));
    label.textContent = '';
    const lineX = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - width));
    for (let index = 0; index < lines.length; index++) {
      const span = document.createElementNS('http://www.w3.org/2000/svg','tspan');
      span.setAttribute('x',String(lineX)); span.setAttribute('y',String(y + index * fontSize * 1.25)); span.textContent = lines[index]; label.append(span);
    }
    const box = boxOf(label), target = wardleyNotePosition(box, obstacles, segments, bounds);
    if (!target) {
      label.textContent = original.text;
      label.setAttribute("font-size", original.attrs["font-size"]);
      label.removeAttribute("data-ibm-wardley-note-original");
      continue;
    }
    const dx = target.x - box.x, dy = target.y - box.y;
    if (dx || dy) label.setAttribute('transform', `translate(${dx},${dy})`);
    const final = boxOf(label); obstacles.push(final);
    const card = document.createElementNS('http://www.w3.org/2000/svg','rect');
    card.setAttribute('class','ibm-wardley-note-card');
    for (const [key,value] of Object.entries({x:final.x-4,y:final.y-4,width:final.width+8,height:final.height+8,rx:4})) card.setAttribute(key,String(value));
    if (Math.abs(lineX-x) > 1 || dx || dy) {
      const leader = document.createElementNS('http://www.w3.org/2000/svg','line');
      leader.setAttribute('class','wardley-link ibm-wardley-note-leader');
      for (const [key,value] of Object.entries({x1:x,y1:y,x2:Math.max(final.x,Math.min(x,final.x+final.width)),y2:Math.max(final.y,Math.min(y,final.y+final.height))})) leader.setAttribute(key,String(value));
      leader.setAttribute('stroke-dasharray','3 4'); label.before(leader);
    }
    label.before(card);
  }
  svg.dispatchEvent(new Event('ibm-geometry-change'));
}
