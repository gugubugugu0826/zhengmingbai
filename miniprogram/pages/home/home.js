/**
 * 首页（一期骨架）
 *
 * - 顶部问候语（昵称 / 手机号）
 * - 「开始整理」大按钮 → 跳转 webview 占位页（完整拍照/整理流程复用 H5，二期小程序原生实现）
 * - 空间列表占位：调 GET /spaces；接口未就绪或为空时展示占位文案
 */
const request = require('../../utils/request');

Page({
  data: {
    nickname: '朋友',
    spaces: [],
    loading: true,
    loadError: '',
  },

  onShow() {
    // 未登录兜底：回登录页
    const token = getApp().globalData.token || wx.getStorageSync('token');
    if (!token) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    const userInfo = getApp().globalData.userInfo || wx.getStorageSync('userInfo');
    this.setData({
      nickname: (userInfo && (userInfo.nickname || userInfo.phone)) || '朋友',
    });

    this.loadSpaces();
  },

  /**
   * 拉取空间列表。后端未实现该接口时优雅降级为占位文案，不阻塞骨架演示。
   */
  async loadSpaces() {
    this.setData({ loading: true, loadError: '' });
    try {
      const data = await request.get('/spaces');
      // 兼容两种返回形态：数组 或 { list: [] }
      const list = Array.isArray(data) ? data : ((data && data.list) || []);
      this.setData({ spaces: list, loading: false });
    } catch (e) {
      this.setData({
        spaces: [],
        loading: false,
        loadError: (e && e.message) || '空间列表加载失败',
      });
    }
  },

  /**
   * 「开始整理」：一期跳 webview 占位页，说明完整流程在 H5 体验。
   */
  onStartOrganize() {
    wx.navigateTo({ url: '/pages/webview/webview' });
  },

  /**
   * 退出登录。
   */
  onLogout() {
    getApp().clearSession();
    wx.reLaunch({ url: '/pages/login/login' });
  },

  onPullDownRefresh() {
    this.loadSpaces().finally(() => {
      wx.stopPullDownRefresh();
    });
  },
});
