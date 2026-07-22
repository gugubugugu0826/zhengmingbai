/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // v3 三档断点（设计稿 p34）：xs 375 / md 768 / desktop 1280
    screens: {
      xs: '375px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      desktop: '1280px',
    },
    extend: {
      colors: {
        // v3 设计系统 v1.0 色板（设计稿 p1，单一来源，v2.2 旧色值已全部收敛替换）
        canvas: '#FAF6EE', // 画布米白 bg-canvas
        cream: '#FAF6EE', // 别名沿用（v2.2 页面大量引用 bg-cream）
        card: '#FFFFFF', // 卡片白 bg-card
        tint: '#F2EBDC', // 暖调浅棕 bg-tint
        primary: '#B08968', // 原木棕·主色 brand
        'primary-dark': '#7D5A2F', // 深木棕·强调 brand-deep
        honey: '#D4A574', // 蜂蜜色·点缀 honey
        sage: '#7B9F76', // 鼠尾草绿 sage
        'sage-dark': '#5F7F5A',
        success: '#4A6B3A', // 成功 success
        warning: '#C49A4A', // 警告 warning
        danger: '#B22222', // 错误 error
        warm: '#2A1F18', // 主文字 text-primary
        'warm-secondary': '#5C4A3D', // 次文字 text-secondary
        'warm-light': '#9C8A78', // 弱文字 text-tertiary
        'border-subtle': '#E8E0D2', // 浅描边 border-subtle
        'border-strong': '#D6CBB8', // 深描边 border-strong
        soft: '#F3EDE5', // 卡片内浅底（v2.2 沿用）
      },
      borderRadius: {
        // v3 圆角阶梯（设计稿 p1）：sm8 / md12 / lg20 / xl24 / pill
        sm: '8px',
        md: '12px',
        lg: '20px',
        xl: '24px',
        pill: '999px',
        // v2.2 语义别名（保留映射，避免旧页面大面积改动）
        card: '20px',
        btn: '12px',
        tag: '8px',
      },
      spacing: {
        // v3 间距阶梯 4/8/12/16/20/24/32/48（Tailwind 默认已覆盖 4 的倍数，无需增量）
      },
      fontFamily: {
        // v3 字体：Inter + 更纱黑体（Sarasa Gothic SC 无免费 CDN，用系统栈 fallback，架构待明确事项 3）
        sans: [
          'Inter',
          '"Sarasa Gothic SC"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
      boxShadow: {
        // v3 阴影（设计稿 p1）：卡片阴影 + 悬浮抬升
        card: '0 2px 12px rgba(176, 137, 104, 0.10)',
        float: '0 4px 16px rgba(176, 137, 104, 0.14)',
      },
      maxWidth: {
        content: '1200px', // 桌面主内容区最大宽度
      },
    },
  },
  plugins: [],
};
