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
          const header = document.createElement('div')
          header.className = 'slide-header'
          const badge = document.createElement('span')
          badge.className = 'slide-header-badge'
          if (opts.badge) badge.textContent = opts.badge
          else badge.classList.add('is-cont') // 续页：占位不显字母
          inner.insertBefore(header, title)
          header.appendChild(badge)
          header.appendChild(title) // 移动标题进页眉
          if (opts.tag) {
              const tagEl = document.createElement('span')
              tagEl.className = 'slide-header-tag'
              tagEl.textContent = opts.tag
              header.appendChild(tagEl) // 右上分类标签
          }
      }
  }
  const body = document.createElement('div')
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

function tuneCoverSlide(section: HTMLElement) {
  const inner = section.querySelector<HTMLElement>(':scope > .slide-inner')
  if (!inner) return
  const textLength = (inner.textContent ?? '').trim().length
  if (textLength < 80) section.dataset.density = 'quiet'
}
