export const PAGE_NUMBER_FORMATS: Record<string, (page: number, total?: number) => string> = {
  plain: page => `${page}`,
  total: (page, total) => `${page} / ${total}`,
  gov: page => `- ${page} -`,
  zh: page => `第 ${page} 页`
};
