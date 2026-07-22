/**
 * wx.request 统一封装
 *
 * 职责：
 * - 自动拼接 API_BASE
 * - 自动携带 Authorization: Bearer <token>
 * - 按后端约定 { code: 0, data, message } 解包；code !== 0 统一 reject
 * - 401 统一清登录态并跳转登录页
 *
 * 用法：
 *   const request = require('../../utils/request');
 *   request.get('/spaces').then(data => ...).catch(err => ...);
 */

const { API_BASE } = require('./config');

/**
 * 统一请求方法。
 * @param {object} options
 * @param {string} options.method HTTP 方法
 * @param {string} options.url 以 / 开头的 API 路径（不含 API_BASE）
 * @param {object} [options.data] 请求体（GET 会拼成 query）
 * @param {boolean} [options.auth] 是否携带 token，默认 true
 * @returns {Promise<any>} 解包后的 data 字段
 */
function request({ method, url, data = {}, auth = true }) {
  return new Promise((resolve, reject) => {
    const app = getApp();
    const header = { 'Content-Type': 'application/json' };
    if (auth) {
      const token = (app && app.globalData && app.globalData.token) || wx.getStorageSync('token');
      if (token) {
        header.Authorization = `Bearer ${token}`;
      }
    }

    wx.request({
      url: `${API_BASE}${url}`,
      method,
      data,
      header,
      success(res) {
        const status = res.statusCode;
        const body = res.data || {};

        // 401：token 失效，清登录态跳登录
        if (status === 401) {
          if (app && typeof app.clearSession === 'function') {
            app.clearSession();
          }
          wx.reLaunch({ url: '/pages/login/login' });
          reject({ code: 401, message: '登录已过期，请重新登录' });
          return;
        }

        // HTTP 层错误
        if (status < 200 || status >= 300) {
          reject({ code: status, message: body.message || `请求失败（HTTP ${status}）` });
          return;
        }

        // 业务层按 { code: 0, data } 约定解包
        if (body.code === 0) {
          resolve(body.data);
        } else {
          reject({ code: body.code !== undefined ? body.code : -1, message: body.message || '请求失败' });
        }
      },
      fail(err) {
        reject({ code: -1, message: err.errMsg || '网络异常，请检查后端是否已启动' });
      },
    });
  });
}

module.exports = {
  get(url, data = {}, auth = true) {
    return request({ method: 'GET', url, data, auth });
  },
  post(url, data = {}, auth = true) {
    return request({ method: 'POST', url, data, auth });
  },
  put(url, data = {}, auth = true) {
    return request({ method: 'PUT', url, data, auth });
  },
  delete(url, data = {}, auth = true) {
    return request({ method: 'DELETE', url, data, auth });
  },
};
