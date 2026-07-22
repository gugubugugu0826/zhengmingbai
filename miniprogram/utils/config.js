/**
 * 全局配置
 *
 * ⚠️ 重要说明：
 * 1. 开发期 API_BASE 指向本机后端 http://localhost:3001/api/v1，
 *    需要在微信开发者工具「详情 → 本地设置」勾选「不校验合法域名」才能调试。
 * 2. 真机预览 / 正式版必须：
 *    - 换成 https 域名（http 与 localhost 在真机一律拦截）；
 *    - 在小程序管理后台「开发 → 开发管理 → 服务器域名」把该域名
 *      加入 request 合法域名白名单。
 * 3. 本机调试时，localhost 指开发者电脑自身，所以请确保后端在同一台机器上运行。
 */

/** 后端 API 基础地址 */
const API_BASE = 'http://localhost:3001/api/v1';

/** H5 完整体验地址（webview 占位页预留；真机需业务域名配置） */
const H5_BASE = 'http://localhost:5173';

module.exports = {
  API_BASE,
  H5_BASE,
};
