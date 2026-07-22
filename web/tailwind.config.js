/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // PRD 4.1 设计风格规范
        cream: '#FAF6F0', // 暖米白底
        primary: '#C08A5E', // 低饱和橘棕主色
        'primary-dark': '#A8764F',
        sage: '#A8B8A0', // 雾绿辅助
        'sage-dark': '#8FA088',
        warm: '#5A5248', // 暖灰文字
        'warm-light': '#8A8076', // 浅暖灰
        card: '#FFFFFF',
        soft: '#F3EDE5', // 卡片内浅底
      },
      borderRadius: {
        card: '16px',
        btn: '12px',
        tag: '8px',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 2px 12px rgba(90, 82, 72, 0.08)',
      },
    },
  },
  plugins: [],
};
