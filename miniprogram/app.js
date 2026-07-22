/**
 * 整明白 AI 整理收纳助手 - 小程序入口（v3）
 *
 * 全局状态只保存 token 与当前用户基本信息，避免引入重型状态库。
 * maintenanceNotice 由 utils/request.js 拦截 3001 时写入，页面级统一监听。
 */
App({
  /** 全局数据 */
  globalData: {
    /** 已登录用户 token（持久化到 storage） */
    token: '',
    /** 当前用户信息（PublicUser 结构） */
    userInfo: null,
    /** 当前点数余额（登录/分析后刷新） */
    balance: 0,
    /** 维护模式公告（非空 = 维护中，各页渲染维护占位） */
    maintenanceNotice: '',
    /** 订阅消息模板 ID（configs/public 下发，空串 = 不展示授权引导） */
    subscribeTemplateId: '',
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
   * @param {number} [balance] 点数余额
   */
  setSession(token, userInfo, balance) {
    this.globalData.token = token;
    this.globalData.userInfo = userInfo || null;
    if (typeof balance === 'number') {
      this.globalData.balance = balance;
    }
    wx.setStorageSync('token', token);
    if (userInfo) {
      wx.setStorageSync('userInfo', userInfo);
    }
  },

  /**
   * 清除登录态并跳回登录页（2001 时由 utils/request.js 调用）。
   */
  clearSession() {
    this.globalData.token = '';
    this.globalData.userInfo = null;
    this.globalData.balance = 0;
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
  },
});
