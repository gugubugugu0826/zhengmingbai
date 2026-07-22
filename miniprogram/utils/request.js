/**
 * wx.request 统一封装（v3）
 *
 * 职责：
 * - 自动拼接 API_BASE
 * - 自动携带 Authorization: Bearer <token>
 * - 按后端约定 { code: 0, data, message } 解包；code !== 0 统一 reject
 * - 2001（未登录/过期）统一清登录态并跳登录页
 * - 3001（维护模式，HTTP 503）写入 globalData.maintenanceNotice 并弹维护提示
 *
 * 用法：
 *   const request = require('../../utils/request');
 *   request.get('/spaces').then(data => ...).catch(err => ...);
 */

const { API_BASE } = require('./config');

/** v3 错误码常量（与后端共享知识对齐） */
const CODES = {
  UNAUTHORIZED: 2001,
  FORBIDDEN: 2003,
  CAPTCHA_WRONG: 2101,
  EMAIL_CODE_WRONG: 2102,
  SEND_TOO_OFTEN: 2103,
  SEND_DAILY_LIMIT: 2104,
  EMAIL_TAKEN: 2105,
  USERNAME_TAKEN: 2106,
  /** v3：暂停注册（从"手机号占用"让位） */
  REGISTRATION_PAUSED: 2107,
  /** v3：手机号占用（从 2107 迁来） */
  PHONE_TAKEN: 2108,
  /** 维护模式（HTTP 503） */
  MAINTENANCE: 3001,
};

/**
 * 维护模式处理：写全局状态 + 弹提示（各页 onShow 自行读 globalData 渲染维护占位）。
 * @param {object} body 响应体
 */
function handleMaintenance(body) {
  const notice =
    (body && body.data && typeof body.data.notice === 'string' && body.data.notice.trim()) ||
    (body && body.message) ||
    '系统维护中，请稍后再来';
  try {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.maintenanceNotice = notice;
    }
  } catch (e) {
    // getApp 在极早期可能不可用，忽略
  }
  wx.showModal({
    title: '系统维护中',
    content: notice,
    showCancel: false,
    confirmText: '知道了',
    confirmColor: '#B08968',
  });
}

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
        const code = typeof body.code === 'number' ? body.code : -1;

        // 维护模式：HTTP 503 + code 3001
        if (code === CODES.MAINTENANCE || status === 503) {
          handleMaintenance(body);
          reject({ code: CODES.MAINTENANCE, message: body.message || '系统维护中，请稍后再来' });
          return;
        }

        // 未登录/过期：清登录态跳登录
        if (status === 401 || code === CODES.UNAUTHORIZED) {
          if (app && typeof app.clearSession === 'function') {
            app.clearSession();
          }
          wx.reLaunch({ url: '/pages/login/login' });
          reject({ code: CODES.UNAUTHORIZED, message: '登录已过期，请重新登录' });
          return;
        }

        // HTTP 层错误
        if (status < 200 || status >= 300) {
          reject({
            code,
            message: body.message || `请求失败（HTTP ${status}）`,
          });
          return;
        }

        // 业务层按 { code: 0, data } 约定解包
        if (body.code === 0) {
          resolve(body.data);
        } else {
          reject({
            code,
            message: body.message || '请求失败',
          });
        }
      },
      fail(err) {
        reject({ code: -1, message: err.errMsg || '网络开了小差，请稍后再试' });
      },
    });
  });
}

/**
 * 统一错误提示（catch 兜底）。
 * @param {object} e request reject 的错误对象
 * @param {string} [fallback] 兜底文案
 */
function toastError(e, fallback) {
  const message = (e && e.message) || fallback || '操作失败，请稍后再试';
  // 维护/未登录已由拦截层处理，不再重复 toast
  if (e && (e.code === CODES.MAINTENANCE || e.code === CODES.UNAUTHORIZED)) {
    return;
  }
  wx.showToast({ title: message, icon: 'none', duration: 2500 });
}

module.exports = {
  CODES,
  toastError,
  get(url, data = {}, auth = true) {
    return request({ method: 'GET', url, data, auth });
  },
  post(url, data = {}, auth = true) {
    return request({ method: 'POST', url, data, auth });
  },
  put(url, data = {}, auth = true) {
    return request({ method: 'PUT', url, data, auth });
  },
  patch(url, data = {}, auth = true) {
    return request({ method: 'PATCH', url, data, auth });
  },
  delete(url, data = {}, auth = true) {
    return request({ method: 'DELETE', url, data, auth });
  },
};
