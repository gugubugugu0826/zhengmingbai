/**
 * 首页（v3，对齐 Web Home 页）：
 * 问候语 + AI 方案 Hero 卡 + 我的家完成度卡 + 快捷入口 + 消息提醒面板。
 * 首次进入（privacy_agreed=false）弹隐私政策，不同意退出到登录页。
 */
const request = require('../../utils/request');
const { ensureLogin } = require('../../utils/auth');
const { spaceEmoji, formatLastTime, SPACE_TYPE_LABELS } = require('../../utils/constants');

Page({
  data: {
    nickname: '朋友',
    balance: 0,
    spaces: null,
    totalSessions: 0,
    unread: 0,
    messages: [],
    loading: true,
    // 隐私政策弹窗
    showPrivacy: false,
    agreeing: false,
    // 问候语
    greeting: '你好',
  },

  onShow() {
    if (!ensureLogin()) return;

    const app = getApp();
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo');
    const hour = new Date().getHours();
    this.setData({
      nickname: (userInfo && (userInfo.nickname || userInfo.username || userInfo.phone)) || '朋友',
      balance: app.globalData.balance || 0,
      greeting: hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好',
      showPrivacy: !!(userInfo && userInfo.privacy_agreed === false),
    });

    // 首次注册赠点提示（只弹一次，storage 记忆）
    if (userInfo && userInfo.is_new_gift_used === 1 && wx.getStorageSync('gift_toast_shown') !== '1') {
      wx.setStorageSync('gift_toast_shown', '1');
      wx.showToast({
        title: '欢迎！已送你 20 点，先去拍一张试试～',
        icon: 'none',
        duration: 3000,
      });
    }

    this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true });
    try {
      const spaces = await request.get('/spaces');
      const list = Array.isArray(spaces) ? spaces : [];
      this.setData({
        spaces: list.map((s) => ({
          ...s,
          emoji: spaceEmoji(s.space_type),
          typeLabel: SPACE_TYPE_LABELS[s.space_type] || '空间',
          lastTimeText: formatLastTime(s.last_session_at),
        })),
        totalSessions: list.reduce((sum, s) => sum + (s.session_count || 0), 0),
        loading: false,
      });
    } catch (e) {
      this.setData({ spaces: [], loading: false });
      request.toastError(e, '空间列表加载失败');
    }
    // 未读数与最近消息失败不阻塞首页
    request
      .get('/messages/unread-count')
      .then((d) => this.setData({ unread: d.count || 0 }))
      .catch(() => undefined);
    request
      .get('/messages')
      .then((list) => this.setData({ messages: (Array.isArray(list) ? list : []).slice(0, 3) }))
      .catch(() => undefined);
    // 余额刷新
    request
      .get('/points/balance')
      .then((d) => {
        this.setData({ balance: d.balance });
        getApp().globalData.balance = d.balance;
      })
      .catch(() => undefined);
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  /* ============ 隐私政策弹窗 ============ */

  async onAgreePrivacy() {
    if (this.data.agreeing) return;
    this.setData({ agreeing: true });
    try {
      await request.post('/auth/privacy/agree');
      const app = getApp();
      const userInfo = { ...(app.globalData.userInfo || {}), privacy_agreed: true };
      app.globalData.userInfo = userInfo;
      wx.setStorageSync('userInfo', userInfo);
      this.setData({ showPrivacy: false });
      wx.showToast({ title: '感谢信任，我们会好好保护你的照片', icon: 'none', duration: 2000 });
    } catch (e) {
      request.toastError(e, '操作失败，请稍后再试');
    } finally {
      this.setData({ agreeing: false });
    }
  },

  onDisagreePrivacy() {
    getApp().clearSession();
    wx.reLaunch({ url: '/pages/login/login' });
  },

  /* ============ 跳转 ============ */

  goCapture() {
    wx.navigateTo({ url: '/pages/capture/capture' });
  },

  goSpaces() {
    wx.switchTab({ url: '/pages/spaces/spaces' });
  },

  goAccount() {
    wx.switchTab({ url: '/pages/account/account' });
  },

  goPoints() {
    wx.navigateTo({ url: '/pages/points/points' });
  },

  goMessages() {
    wx.navigateTo({ url: '/pages/messages/messages' });
  },

  goSpaceDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/space-detail/space-detail?id=${id}` });
  },
});
