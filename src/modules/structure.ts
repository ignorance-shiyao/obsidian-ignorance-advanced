// 部分移植自 MorphDraft src/core/slides/structure.ts（MIT）。
import type { SlideLayout } from './layout'

export interface StructureOpts {
    chrome?: boolean // 注入页眉条（字母角标 + 标题）。仅 chrome 皮肤启用，避免影响其他皮肤
    badge?: string // 页眉角标字母（如 'A'）；空 = 续页占位
    tag?: string // 页眉右上分类标签（<!-- layout: x | 标签 -->）
}

// split/grid 与 default 同构（标题 + .slide-body），仅 CSS 排布不同 → 复用 structureDefaultSlide
const BODY_LAYOUTS = new Set<SlideLayout>(['default', 'split', 'grid'])

export function structureSlide(section: HTMLElement, layout: SlideLayout, opts: StructureOpts = {}) {
    if (BODY_LAYOUTS.has(layout)) structureDefaultSlide(section, opts)
    if (layout === 'split') balanceSplitColumns(section)
  else if (layout === 'cover') tuneCoverSlide(section)
}

function structureDefaultSlide(section: HTMLElement, opts: StructureOpts) {
  const inner = section.querySelector<HTMLElement>(':scope > .slide-inner')
  if (!inner || inner.querySelector(':scope > .slide-body')) return

  const children = Array.from(inner.children) as HTMLElement[]
  const first = children[0]
  const hasTitle = first && /^H[1-4]$/.test(first.tagName)
  const title = hasTitle ? first : null
  const bodyItems = hasTitle ? children.slice(1) : children
  if (!bodyItems.length) return

  if (title) {
    title.classList.add('slide-title')
      // 页眉条：把标题搬进 .slide-header，前置字母角标（chrome 皮肤专用）
      if (opts.chrome) {
          const header = createDiv()
          header.className = 'slide-header'
          const badge = createSpan()
          badge.className = 'slide-header-badge'
          if (opts.badge) badge.textContent = opts.badge
          else badge.classList.add('is-cont') // 续页：占位不显字母
          inner.insertBefore(header, title)
          header.appendChild(badge)
          header.appendChild(title) // 移动标题进页眉
          if (opts.tag) {
              const tagEl = createSpan()
              tagEl.className = 'slide-header-tag'
              tagEl.textContent = opts.tag
              header.appendChild(tagEl) // 右上分类标签
          }
      }
  }
  const body = createDiv()
  body.className = 'slide-body'
  for (const child of bodyItems) body.appendChild(child)
  inner.appendChild(body)
  tuneBodyDensity(section, body)
}

function tuneBodyDensity(section: HTMLElement, body: HTMLElement) {
  const blocks = Array.from(body.children) as HTMLElement[]
  const hasHeavy = blocks.some((el) =>
    el.matches('pre, table, blockquote, .chart-block, .callout, .cols') ||
    Boolean(el.querySelector(':scope > img, .chart-block, table, pre')),
  )
  const textLength = (body.textContent ?? '').trim().length
  const count = blocks.length
  // Long content is split across pages beforehand; smaller text is only the
  // last resort for a body that would still overflow its page.
  if (body.scrollHeight > body.clientHeight + 4) {
    section.dataset.density = 'dense'
  } else if (!hasHeavy && count <= 3 && textLength < 180) {
    section.dataset.density = 'quiet'
  } else {
    section.dataset.density = 'balanced'
  }
}

// 分栏页：按实测高度把正文块分成左右两栏（替代 CSS 多栏）。只有一个列表时按列表项拆分，有序列表续号
function balanceSplitColumns(section: HTMLElement) {
  const body = section.querySelector<HTMLElement>(':scope > .slide-inner > .slide-body')
  if (!body || body.querySelector(':scope > .ibc-container--cols, :scope > .slide-split-col')) return
  let blocks = Array.from(body.children) as HTMLElement[]
  const only = blocks.length === 1 ? blocks[0] : null
  if (only && /^(UL|OL)$/.test(only.tagName) && only.children.length > 1) {
    const items = Array.from(only.children) as HTMLElement[]
    const half = splitIndex(items)
    const second = only.cloneNode(false) as HTMLElement
    if (only.tagName === 'OL') second.setAttribute('start', String(Number(only.getAttribute('start') || 1) + half))
    second.append(...items.slice(half))
    only.after(second)
    blocks = [only, second]
  }
  if (blocks.length < 2) return
  const half = splitIndex(blocks)
  const left = createDiv({ cls: 'slide-split-col' })
  const right = createDiv({ cls: 'slide-split-col' })
  left.append(...blocks.slice(0, half))
  right.append(...blocks.slice(half))
  body.append(left, right)
  body.classList.add('has-split-cols')
}

// 第一栏取到累计高度过半为止；量不到高度（未挂载）时按块数对半
function splitIndex(blocks: HTMLElement[]): number {
  const heights = blocks.map(el => el.getBoundingClientRect().height)
  const total = heights.reduce((sum, h) => sum + h, 0)
  if (!total) return Math.ceil(blocks.length / 2)
  let sum = 0
  for (let i = 0; i < blocks.length - 1; i += 1) {
    sum += heights[i]
    if (sum >= total / 2) return sum - heights[i] / 2 > total / 2 && i > 0 ? i : i + 1
  }
  return blocks.length - 1
}

function tuneCoverSlide(section: HTMLElement) {
  const inner = section.querySelector<HTMLElement>(':scope > .slide-inner')
  if (!inner) return
  const textLength = (inner.textContent ?? '').trim().length
  if (textLength < 80) section.dataset.density = 'quiet'
}
