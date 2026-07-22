/**
 * 整明白 AI 整理收纳助手 - 小程序入口
 *
 * 一期骨架：仅包含 Mock 登录、首页问候与占位 webview 页。
 * 全局状态只保存 token 与当前用户基本信息，避免引入重型状态库。
 */
App({
  /** 全局数据 */
  globalData: {
    /** 已登录用户 token（持久化到 storage） */
    token: '',
    /** 当前用户信息 { id, phone, nickname } */
    userInfo: null,
  },

  /**
   * 小程序启动：从本地缓存恢复登录态。
   */
  onLaunch() {
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    if (token) {
      this.globalData.token = token;
    }
    if (userInfo) {
      this.globalData.userInfo = userInfo;
    }
  },

  /**
   * 保存登录态：写入 globalData 与 storage。
   * @param {string} token JWT 字符串
   * @param {object} userInfo 用户信息
   */
  setSession(token, userInfo) {
    this.globalData.token = token;
    this.globalData.userInfo = userInfo || null;
    wx.setStorageSync('token', token);
    if (userInfo) {
      wx.setStorageSync('userInfo', userInfo);
    }
  },

  /**
   * 清除登录态并跳回登录页（401 时由 utils/request.js 调用）。
   */
  clearSession() {
    this.globalData.token = '';
    this.globalData.userInfo = null;
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
  },
});
