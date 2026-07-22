/**
 * 登录页（一期 Mock 登录）
 *
 * 后端约定：POST /auth/login { phone, code }，开发 Mock 下任意 4 位验证码即通过，
 * 返回 { code: 0, data: { token, user: { id, phone, nickname } } }。
 * 真实微信登录后端已预留 TODO，二期接入 wx.login。
 */
const request = require('../../utils/request');

Page({
  data: {
    phone: '',
    code: '',
    submitting: false,
    errorMsg: '',
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value.trim(), errorMsg: '' });
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value.trim(), errorMsg: '' });
  },

  /**
   * 表单基础校验：11 位手机号 + 4 位数字验证码（Mock 约定）。
   */
  validate() {
    const { phone, code } = this.data;
    if (!/^1\d{10}$/.test(phone)) {
      return '请输入 11 位手机号';
    }
    if (!/^\d{4}$/.test(code)) {
      return '请输入 4 位数字验证码';
    }
    return '';
  },

  /**
   * 提交登录。
   */
  async onLogin() {
    if (this.data.submitting) return;

    const err = this.validate();
    if (err) {
      this.setData({ errorMsg: err });
      return;
    }

    this.setData({ submitting: true, errorMsg: '' });
    try {
      // Mock 登录无需 token，auth 传 false
      const data = await request.post('/auth/login', {
        phone: this.data.phone,
        code: this.data.code,
      }, false);

      const token = data && data.token;
      const user = (data && data.user) || null;
      if (!token) {
        throw new Error('登录响应缺少 token');
      }

      getApp().setSession(token, user);
      wx.showToast({ title: '登录成功', icon: 'success' });
      wx.reLaunch({ url: '/pages/home/home' });
    } catch (e) {
      this.setData({ errorMsg: (e && e.message) || '登录失败，请稍后重试' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  /**
   * 「获取验证码」按钮：一期为 Mock，后端不做短信下发，直接提示任意 4 位数字即可。
   */
  onGetCode() {
    wx.showToast({
      title: 'Mock 模式：任意 4 位数字即可',
      icon: 'none',
      duration: 2500,
    });
  },
});
