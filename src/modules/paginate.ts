// 移植自 MorphDraft src/core/slides/paginate.ts（MIT）。
// 内容自适应自动分页的共享测量逻辑。
// 给定一个 .slide-inner，按其顶层块的真实高度贪心打包成多页，返回每页的元素分组。
// 续页为重复的 H1 章节标题预留 h1Reserve 高度。

// Pages are filled to this share of their height: the final layout (title bar,
// body width, gaps) is applied after measuring, and a full page reads crowded.
export const PAGE_FILL = 0.82

export function computePageGroups(inner: HTMLElement, h1Reserve: number): HTMLElement[][] {
  const kids = Array.from(inner.children) as HTMLElement[]
  const avail = Math.floor(inner.clientHeight * PAGE_FILL)
  if (avail <= 0 || kids.length === 0) return [kids]

  const blocks = groupBlocks(kids)
  const pages: HTMLElement[][] = [[]]
  let pageTop = 0
  let capacity = avail
  for (const block of blocks) {
    const first = block[0]
    const last = block[block.length - 1]
    const relBottom = last.offsetTop - pageTop + last.offsetHeight
    const cur = pages[pages.length - 1]
    if (relBottom > capacity && cur.length > 0) {
      const moved = moveTrailingHeading(cur)
      pages.push(moved ?? [])
      pageTop = (moved?.[0] ?? first).offsetTop
      capacity = avail - h1Reserve // 续页给重复 H1 让位
    }
    pages[pages.length - 1].push(...block)
  }
  return pages.filter((page) => page.length > 0)
}

// 块内拆分：把「单块高于一页」的内容就地拆成多个兄弟节点，使 computePageGroups 能把它们分到多页。
// - 列表(ul/ol)：按 <li> 拆，续段保留标签/类，有序列表用 start 接续编号（DOM 安全）。
// - 表格(table)：按 <tbody> 行拆，每段重复 <thead>（DOM 安全）。
// - 其余不可安全拆的(代码块/图表/图片等)：等比缩放到不超页，绝不裁切丢内容。
// 在 computePageGroups 之前调用；此时已在量度容器中、图表已渲染、高度真实。
// A block's real height: scrolling blocks (code, tables) report their content
// height, not the box they are squeezed into.
function fullHeight(el: HTMLElement): number {
  return Math.max(el.offsetHeight, el.scrollHeight)
}

export function splitTallBlocks(inner: HTMLElement, reserve: number): void {
  const avail = Math.floor(inner.clientHeight * PAGE_FILL)
  if (avail <= 0) return
  const budget = Math.max(160, avail - reserve - 16) // 续段目标高度，留出重复 H1 + 余量
  for (const el of Array.from(inner.children) as HTMLElement[]) {
    if (fullHeight(el) <= avail) continue // 不超一页，交给 computePageGroups 打包
    if (el.matches('ul, ol')) splitListByItems(el, budget)
    else if (el.matches('table')) splitTableByRows(el, budget)
    else if (el.matches('pre') && splitCodeByLines(el, budget)) continue
    else if (el.matches('blockquote') && splitContainerByChildren(el, budget)) continue
    else scaleToFit(el, inner.clientHeight - reserve - 8) // 图片/图表等不可拆的块才缩放兜底
  }
}

// 代码块按行拆成多个代码块，保留语法高亮（按 .code-line 元素拆；没有行元素时按换行拆文本）。
function splitCodeByLines(pre: HTMLElement, budget: number): boolean {
  const code = pre.querySelector<HTMLElement>(':scope > code')
  if (!code) return false
  const lineEls = Array.from(code.querySelectorAll<HTMLElement>(':scope > .code-line'))
  const lines: Node[][] = lineEls.length
    ? lineEls.map((line) => [line])
    : (code.textContent ?? '').replace(/\n$/, '').split('\n').map((text) => [document.createTextNode(text + '\n')])
  if (lines.length < 2) return false
  const lineHeight = Math.max(1, (code.scrollHeight || fullHeight(pre)) / lines.length)
  const chrome = Math.max(0, fullHeight(pre) - code.scrollHeight)
  const perPage = Math.max(3, Math.floor((budget - chrome) / lineHeight))
  if (perPage >= lines.length) return false
  for (let start = 0; start < lines.length; start += perPage) {
    const part = pre.cloneNode(false) as HTMLElement
    const partCode = code.cloneNode(false) as HTMLElement
    for (const nodes of lines.slice(start, start + perPage)) for (const node of nodes) partCode.appendChild(node)
    part.appendChild(partCode)
    pre.before(part)
  }
  pre.remove()
  return true
}

// 引用块按段落等子块拆成多个同样式的引用块。
function splitContainerByChildren(container: HTMLElement, budget: number): boolean {
  const children = Array.from(container.children) as HTMLElement[]
  if (children.length < 2) return false
  const chunks: HTMLElement[][] = [[]]
  let top = children[0].offsetTop
  for (const child of children) {
    const relBottom = child.offsetTop - top + child.offsetHeight
    if (relBottom > budget && chunks[chunks.length - 1].length > 0) {
      chunks.push([])
      top = child.offsetTop
    }
    chunks[chunks.length - 1].push(child)
  }
  if (chunks.length < 2) return false
  for (const chunk of chunks) {
    const part = container.cloneNode(false) as HTMLElement
    for (const child of chunk) part.appendChild(child)
    container.before(part)
  }
  container.remove()
  return true
}

function splitListByItems(list: HTMLElement, budget: number): void {
  const items = Array.from(list.children).filter((c) => c.tagName === 'LI') as HTMLElement[]
  if (items.length < 2) return
  const chunks: HTMLElement[][] = [[]]
  let top = items[0].offsetTop
  for (const li of items) {
    const relBottom = li.offsetTop - top + li.offsetHeight
    const cur = chunks[chunks.length - 1]
    if (relBottom > budget && cur.length > 0) {
      chunks.push([])
      top = li.offsetTop
    }
    chunks[chunks.length - 1].push(li)
  }
  if (chunks.length < 2) return
  const isOl = list.tagName === 'OL'
  const baseStart = isOl ? Number(list.getAttribute('start')) || 1 : 1
  let count = 0
  for (const chunk of chunks) {
    const nl = list.cloneNode(false) as HTMLElement // 标签+类+属性，无子节点
    if (isOl) nl.setAttribute('start', String(baseStart + count))
    for (const li of chunk) nl.appendChild(li) // 移动 li
    list.before(nl)
    count += chunk.length
  }
  list.remove()
}

function splitTableByRows(table: HTMLElement, budget: number): void {
  const thead = table.querySelector<HTMLElement>(':scope > thead')
  const tbody = table.querySelector<HTMLElement>(':scope > tbody')
  if (!tbody) return
  const rows = Array.from(tbody.children).filter((r) => r.tagName === 'TR') as HTMLElement[]
  if (rows.length < 2) return
  const rowBudget = Math.max(80, budget - (thead ? thead.offsetHeight : 0))
  const chunks: HTMLElement[][] = [[]]
  let top = rows[0].offsetTop
  for (const r of rows) {
    const relBottom = r.offsetTop - top + r.offsetHeight
    const cur = chunks[chunks.length - 1]
    if (relBottom > rowBudget && cur.length > 0) {
      chunks.push([])
      top = r.offsetTop
    }
    chunks[chunks.length - 1].push(r)
  }
  if (chunks.length < 2) return
  for (const chunk of chunks) {
    const nt = table.cloneNode(false) as HTMLElement
    if (thead) nt.appendChild(thead.cloneNode(true)) // 每段重复表头
    const nb = document.createElement('tbody')
    for (const r of chunk) nb.appendChild(r) // 移动行
    nt.appendChild(nb)
    table.before(nt)
  }
  table.remove()
}

// 不可拆块：等比缩放进一个定高窗口，内容完整可见、不裁切。
function scaleToFit(el: HTMLElement, maxH: number): void {
  const h = el.offsetHeight
  if (maxH <= 0 || h <= maxH) return
  const scale = Math.max(0.4, maxH / h)
  const wrapper = document.createElement('div')
  wrapper.className = 'slide-scale-fit'
  wrapper.style.cssText = `height:${maxH}px;overflow:hidden;`
  el.before(wrapper)
  el.style.transformOrigin = 'top left'
  el.style.transform = `scale(${scale})`
  el.style.width = `${Math.round(100 / scale)}%`
  wrapper.appendChild(el)
}

// 是否溢出（带 4px 容差）。
// 是否溢出（带 4px 容差）：整体超高，或某个块在页内出现了滚动条（被压扁的代码块/表格）。
export function isOverflowing(inner: HTMLElement): boolean {
  const avail = inner.clientHeight
  if (avail <= 0) return false
  if (inner.scrollHeight > avail + 4) return true
  return (Array.from(inner.children) as HTMLElement[]).some((el) => el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 0)
}

// 取章节标题 H1（用于续页重复）及其预留高度。
export function chapterH1(inner: HTMLElement): { h1: HTMLElement | null; reserve: number } {
  // The page title repeats on continuation pages: an H1, or the H2 that opens the slide.
  const first = inner.firstElementChild as HTMLElement | null
  const h1 = inner.querySelector<HTMLElement>(':scope > h1')
    || (first && /^H[12]$/.test(first.tagName) ? first : null)
    || inner.querySelector<HTMLElement>('h1')
  return { h1, reserve: h1 ? h1.offsetHeight + 28 : 0 }
}

// 对已渲染的直接子 section 进行真实高度分页。经典引擎、Slidev 预览和导出共用，
// 保证预览页数、缩略图与最终导出一致。
export function paginateSlideSections(slides: HTMLElement): boolean {
  let changed = false
  const leaves = Array.from(slides.children).filter(
    (s) => s instanceof HTMLElement && s.classList.contains('slide-surface'),
  ) as HTMLElement[]

  for (const sec of leaves) {
    // Single-page designs: the full-bleed image is a background, cover and
    // section pages are meant to stand alone.
    if (['slide-layout-image-full', 'slide-layout-cover', 'slide-layout-section'].some((name) => sec.classList.contains(name))) continue
    const inner = sec.querySelector<HTMLElement>('.slide-inner')
    if (!inner) continue
    const wrappedRoot = inner.children.length === 1
      ? inner.querySelector<HTMLElement>(':scope > .slidev-block')
      : null
    const root = wrappedRoot ?? inner
    if (wrappedRoot) {
      root.style.height = '100%'
      root.style.maxHeight = '100%'
      root.style.overflow = 'auto'
    }
    if (!isOverflowing(root)) {
      if (wrappedRoot) {
        root.style.removeProperty('height')
        root.style.removeProperty('max-height')
        root.style.removeProperty('overflow')
      }
      continue
    }

    const { h1, reserve } = chapterH1(root)
    splitTallBlocks(root, reserve)
    const pages = computePageGroups(root, reserve)
    if (pages.length <= 1) continue

    let anchor: HTMLElement = sec
    for (let p = 1; p < pages.length; p++) {
      const ns = document.createElement('section')
      ns.className = sec.className
      if (ns.classList.contains('slidev-layout-cover') || ns.classList.contains('slidev-layout-intro')) {
        ns.classList.remove('slidev-layout-cover', 'slidev-layout-intro')
        ns.classList.add('slidev-layout-default')
      }
      const startLine = firstPageSourceLine(pages[p], sec)
      if (startLine != null) ns.dataset.startLine = String(startLine)
      ns.dataset.directiveOffset = sec.dataset.directiveOffset ?? '0'
      ns.dataset.autopage = String(p + 1)
      ns.dataset.slidevLayout = ns.classList.contains('slidev-layout-default')
        ? 'default'
        : sec.dataset.slidevLayout ?? ''
      const ninner = document.createElement('div')
      ninner.className = 'slide-inner'
      const pageRoot = wrappedRoot ? wrappedRoot.cloneNode(false) as HTMLElement : ninner
      if (wrappedRoot) {
        pageRoot.style.height = '100%'
        pageRoot.style.maxHeight = '100%'
        pageRoot.style.overflow = 'hidden'
        ninner.appendChild(pageRoot)
      }
      if (h1) {
        const hc = h1.cloneNode(true) as HTMLElement
        hc.dataset.autoRepeat = '1'
        pageRoot.appendChild(hc)
      }
      for (const block of pages[p]) pageRoot.appendChild(block)
      ns.appendChild(ninner)
      anchor.after(ns)
      anchor = ns
      changed = true
    }
    if (wrappedRoot) {
      wrappedRoot.style.height = '100%'
      wrappedRoot.style.maxHeight = '100%'
      wrappedRoot.style.overflow = 'hidden'
    }
  }
  return changed
}

function firstPageSourceLine(page: HTMLElement[], sec: HTMLElement): number | null {
  const base = Number(sec.dataset.startLine ?? '0')
  const directiveOffset = Number(sec.dataset.directiveOffset ?? '0')
  for (const el of page) {
    const source = el.matches('[data-source-line]')
      ? el
      : el.querySelector<HTMLElement>('[data-source-line]')
    const local = Number((source as HTMLElement | null)?.dataset.sourceLine)
    if (Number.isFinite(local)) return base + directiveOffset + local
  }
  return Number.isFinite(base) ? base : null
}

function groupBlocks(kids: HTMLElement[]): HTMLElement[][] {
  const groups: HTMLElement[][] = []
  for (let i = 0; i < kids.length; i++) {
    const current = kids[i]
    const next = kids[i + 1]
    if (isHeading(current) && next && shouldKeepWithNext(current, next)) {
      const group = [current, next]
      if (isShortText(next) && kids[i + 2] && isHeavyContent(kids[i + 2])) {
        group.push(kids[i + 2])
        i += 2
      } else {
        i += 1
      }
      groups.push(group)
      continue
    }
    if (isShortText(current) && next && isHeavyContent(next)) {
      groups.push([current, next])
      i += 1
      continue
    }
    groups.push([current])
  }
  return groups
}

function moveTrailingHeading(page: HTMLElement[]): HTMLElement[] | null {
  const last = page[page.length - 1]
  if (!last || !isHeading(last)) return null
  page.pop()
  return [last]
}

function isHeading(el: HTMLElement): boolean {
  return /^H[2-4]$/.test(el.tagName)
}

function shouldKeepWithNext(heading: HTMLElement, next: HTMLElement): boolean {
  if (!/^H[2-4]$/.test(heading.tagName)) return false
  return isHeavyContent(next) || isTextBlock(next)
}

function isHeavyContent(el: HTMLElement): boolean {
  return (
    el.matches('pre, table, blockquote, .chart-block, .callout, .cols') ||
    Boolean(el.querySelector(':scope > img, .chart-block, table, pre'))
  )
}

function isTextBlock(el: HTMLElement): boolean {
  return el.matches('p, ul, ol')
}

function isShortText(el: HTMLElement): boolean {
  if (!isTextBlock(el)) return false
  const text = (el.textContent ?? '').trim()
  return text.length > 0 && text.length <= 90 && el.offsetHeight < 120
}
