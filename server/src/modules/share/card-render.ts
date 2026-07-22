/**
 * 分享卡片 SVG 渲染（R7，简化实现）。
 * 纯字符串拼接，无 canvas 等原生依赖；米白底 #FAF6F0 + 橘棕 #C08A5E。
 * 750x1000：封面占位 + ≤5 条方案要点 + 品牌名「整明白」。
 */

export const CARD_COLORS = {
  bg: '#FAF6F0',
  primary: '#C08A5E',
  textDark: '#4A3B30',
  textLight: '#8A7462',
  coverBg: '#EFE4D8',
} as const;

/** XML 转义（用户文案可能含 <>& 等字符） */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 单条文案超长截断，防止撑破卡片 */
function clip(text: string, max = 30): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface ShareCardData {
  spaceLabel: string;
  points: string[];
  brand: string;
}

/** 生成 750x1000 分享卡片 SVG */
export function renderShareCardSvg(data: ShareCardData): string {
  const { spaceLabel, points, brand } = data;
  const top5 = points.slice(0, 5);
  const pointRows = top5
    .map((p, i) => {
      const y = 560 + i * 70;
      return `
  <circle cx="90" cy="${y - 8}" r="14" fill="${CARD_COLORS.primary}"/>
  <text x="90" y="${y - 2}" font-size="18" fill="#FFFFFF" text-anchor="middle" font-family="sans-serif">${i + 1}</text>
  <text x="120" y="${y}" font-size="26" fill="${CARD_COLORS.textDark}" font-family="sans-serif">${esc(clip(p))}</text>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="1000" viewBox="0 0 750 1000">
  <rect width="750" height="1000" fill="${CARD_COLORS.bg}"/>
  <!-- 顶部品牌条 -->
  <text x="60" y="90" font-size="34" font-weight="bold" fill="${CARD_COLORS.primary}" font-family="sans-serif">${esc(brand)}</text>
  <text x="60" y="130" font-size="22" fill="${CARD_COLORS.textLight}" font-family="sans-serif">AI 整理收纳助手 · 把每个空间整明白</text>
  <!-- 封面占位 -->
  <rect x="60" y="170" width="630" height="320" rx="20" fill="${CARD_COLORS.coverBg}"/>
  <rect x="60" y="170" width="630" height="320" rx="20" fill="none" stroke="${CARD_COLORS.primary}" stroke-width="2" stroke-dasharray="8 6"/>
  <text x="375" y="320" font-size="30" fill="${CARD_COLORS.textLight}" text-anchor="middle" font-family="sans-serif">我的${esc(clip(spaceLabel, 12))}整理成果</text>
  <text x="375" y="365" font-size="22" fill="${CARD_COLORS.textLight}" text-anchor="middle" font-family="sans-serif">照片按隐私设置已妥善保管</text>
  <!-- 方案要点 -->
  <text x="60" y="540" font-size="24" font-weight="bold" fill="${CARD_COLORS.textDark}" font-family="sans-serif">整理要点</text>
  ${pointRows || `<text x="60" y="560" font-size="26" fill="${CARD_COLORS.textLight}" font-family="sans-serif">照着方案做，空间慢慢就清爽了</text>`}
  <!-- 底部品牌 -->
  <line x1="60" y1="910" x2="690" y2="910" stroke="${CARD_COLORS.primary}" stroke-width="1" opacity="0.4"/>
  <text x="375" y="955" font-size="24" fill="${CARD_COLORS.primary}" text-anchor="middle" font-family="sans-serif">${esc(brand)} · 你说了算的整理方案</text>
</svg>`;
}

/** 手绘风示意插画素材（R5 一期素材图，4 场景） */
export function renderIllustrationSvg(scene: string): string {
  const title =
    { kitchen: '井井有条的厨房', bedroom: '清清爽爽的卧室', wardrobe: '一目了然的衣柜', living: '干干净净的家' }[
      scene
    ] ?? '干干净净的家';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="560" viewBox="0 0 750 560">
  <rect width="750" height="560" rx="20" fill="${CARD_COLORS.bg}"/>
  <!-- 手绘风：几个圆角"收纳盒" + 虚线轮廓 -->
  <rect x="90" y="180" width="160" height="200" rx="16" fill="${CARD_COLORS.coverBg}" stroke="${CARD_COLORS.primary}" stroke-width="3"/>
  <rect x="295" y="140" width="160" height="240" rx="16" fill="#F3E9DC" stroke="${CARD_COLORS.primary}" stroke-width="3"/>
  <rect x="500" y="200" width="160" height="180" rx="16" fill="${CARD_COLORS.coverBg}" stroke="${CARD_COLORS.primary}" stroke-width="3" stroke-dasharray="10 8"/>
  <circle cx="170" cy="130" r="34" fill="${CARD_COLORS.primary}" opacity="0.85"/>
  <text x="375" y="470" font-size="34" fill="${CARD_COLORS.textDark}" text-anchor="middle" font-family="sans-serif">${title}</text>
  <text x="375" y="515" font-size="22" fill="${CARD_COLORS.textLight}" text-anchor="middle" font-family="sans-serif">每类东西都有自己的家</text>
</svg>`;
}
