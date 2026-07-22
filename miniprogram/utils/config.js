/**
 * 全局配置（v3）
 *
 * ⚠️ 重要说明：
 * 1. 正式环境 API_BASE 指向 https://zhengmingbai.cn/api/v1（域名已在小程序后台配置）。
 * 2. 开发期如需指向本机后端 http://localhost:3001/api/v1，
 *    需要在微信开发者工具「详情 → 本地设置」勾选「不校验合法域名」才能调试。
 * 3. 真机预览 / 正式版必须使用 https 域名（http 与 localhost 在真机一律拦截）。
 */

/** 后端 API 基础地址 */
const API_BASE = 'https://zhengmingbai.cn/api/v1';

/** H5 备用体验地址（webview 承载隐私政策等页面） */
const H5_BASE = 'https://zhengmingbai.cn';

module.exports = {
  API_BASE,
  H5_BASE,
};
