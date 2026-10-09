// 部分移植自 MorphDraft src/core/slides/layout.ts（MIT）。
// 解析每张幻灯片的版式。
// 显式指令：slide 第一行 `<!-- layout: cover -->`（cover/section/center/default）。
// 未指定时按内容自动推断：只有一个标题(可带一句副标题) → cover。

export type SlideLayout =
  | 'cover'
  | 'section'
  | 'center'
  | 'default'
  | 'image-left'
  | 'image-right'
    | 'split'       // 正文自动双栏分流（磁带式）
    | 'grid'        // 正文块排成卡片栅格
    | 'image-full'  // 首图整屏铺底 + 文字叠加

const KNOWN: SlideLayout[] = [
    'cover', 'section', 'center', 'default', 'image-left', 'image-right',
    'split', 'grid', 'image-full',
]

// 版式指令；可选「| 分类标签」放在同一行（如 <!-- layout: default | 市场分析 -->），
// 标签渲染到页眉条右上（仅 chrome 皮肤）。单行 → 不影响行号补偿。
const DIRECTIVE = /^\s*<!--\s*layout:\s*([a-z-]+)\s*(?:\|\s*([^>]+?)\s*)?-->\s*\n?/i

export interface ParsedSlide {
  layout: SlideLayout
  body: string
  directiveOffset: number // 被删除的 layout 注释行数（用于行号补偿）
  tag?: string // 页眉右上分类标签
}

export function parseSlideLayout(md: string): ParsedSlide {
  const m = DIRECTIVE.exec(md)
  if (m) {
    const name = m[1].toLowerCase()
    const layout = (KNOWN.includes(name as SlideLayout) ? name : 'default') as SlideLayout
    const tag = m[2]?.trim() || undefined
    // 计算被删掉的行数 = 匹配文本里的换行符个数。
    // 注意：不能用 split('\n').length（尾换行会多算 1 行 → 行号补偿 off-by-one）。
    const directiveText = m[0]
    const directiveLines = (directiveText.match(/\n/g) || []).length
    return { layout, body: md.replace(DIRECTIVE, ''), directiveOffset: directiveLines, tag }
  }
  return { layout: autoLayout(md), body: md, directiveOffset: 0 }
}

// 自动版式（S3）：按内容特征推断，未命中再回退 default。
// 仅用已存在的版式类型，且只在「无显式 layout 指令」时生效，回归风险低。
function autoLayout(md: string): SlideLayout {
  const lines = md
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const headings = lines.filter((l) => /^#{1,6}\s/.test(l))
  const nonHeading = lines.filter((l) => !/^#{1,6}\s/.test(l))
  const images = lines.filter((l) => /^!\[.*\]\(.*\)/.test(l))
  const quotes = lines.filter((l) => /^>/.test(l))
  const hasBlock = lines.some((l) => /^(```|:::|[-*]\s|\d+\.\s|>|\|)/.test(l))

  // 仅 1 个标题 + 最多 1 行文字、无块 → 封面
  if (headings.length === 1 && nonHeading.length <= 1 && !hasBlock) return 'cover'
  // 短引用/金句（≤4 行且以引用为主、无图）→ 居中
  if (quotes.length && lines.length <= 4 && !images.length) return 'center'
    // 多图（≥3）以图为主、文字不多 → 整图铺底（取首图）
    if (images.length >= 3 && nonHeading.length - images.length <= 2) return 'image-full'
    // 2 张图 → 栅格（图卡并排）
    if (images.length === 2) return 'grid'
  // 单图 + 配文（图文混排，≤6 行）→ 图右
  if (images.length === 1 && lines.length <= 6) return 'image-right'
    // 内容厚重（多块、长文）且无图 → 自动双栏，避免单列拥挤
    const heavyBlocks = lines.filter((l) => /^(\||[-*]\s|\d+\.\s|>)/.test(l)).length
    if (!images.length && lines.length >= 12 && heavyBlocks >= 8) return 'split'
  return 'default'
}
