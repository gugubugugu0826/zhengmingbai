/**
 * 忘记密码页（v3 §5-C，新页面，对齐 Web ForgotPassword）：
 * 流程：输邮箱 → 点「发送验证码」弹图形码弹窗 → POST /auth/email-code
 * （scene='reset_password'，未注册邮箱也统一提示"验证码已发送"，防枚举）
 * → 输 6 位验证码 + 新密码（≥8 位含字母数字）+ 确认 → POST /auth/password-reset
 * → 重置成功回登录页。重置后旧密码立即失效。
 */
const request = require('../../utils/request');
const { startCountdown } = require('../../utils/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Page({
  data: {
    email: '',
    code: '',
    password: '',
    password2: '',
    countdown: 0,
    captchaOpen: false,
    codeSent: false,
    submitting: false,
  },

  _cancelCountdown: null,

  onUnload() {
    if (this._cancelCountdown) this._cancelCountdown();
  },

  onEmailInput(e) {
    this.setData({ email: (e.detail.value || '').trim() });
  },

  onCodeInput(e) {
    this.setData({ code: (e.detail.value || '').replace(/\D/g, '') });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value || '' });
  },

  onPassword2Input(e) {
    this.setData({ password2: e.detail.value || '' });
  },

  /** 点「发送验证码」：本地校验邮箱 → 开图形码弹窗 */
  openSendCaptcha() {
    if (!EMAIL_RE.test(this.data.email)) {
      wx.showToast({ title: '请输入正确的邮箱地址', icon: 'none' });
      return;
    }
    this.setData({ captchaOpen: true });
  },

  onCaptchaClose() {
    this.setData({ captchaOpen: false });
  },

  /** 图形码通过后发码（scene=reset_password，防枚举统一提示） */
  onCaptchaVerified(e) {
    const { captchaId, captchaCode } = e.detail;
    this.setData({ captchaOpen: false });
    request
      .post(
        '/auth/email-code',
        {
          email: this.data.email,
          scene: 'reset_password',
          captcha_id: captchaId,
          captcha_code: captchaCode,
        },
        false,
      )
      .then(() => {
        // 防枚举：无论邮箱是否注册都提示已发送
        wx.showToast({ title: '验证码已发送，5 分钟内有效', icon: 'none', duration: 2000 });
        this.setData({ codeSent: true });
        if (this._cancelCountdown) this._cancelCountdown();
        this._cancelCountdown = startCountdown((n) => this.setData({ countdown: n }));
      })
      .catch((err) => {
        if (err && err.code === 2101) {
          this.setData({ captchaOpen: true });
          wx.showToast({ title: '图形验证码不对，再来一次', icon: 'none' });
        } else {
          request.toastError(err, '发送失败，请稍后再试');
        }
      });
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const { email, code, password, password2 } = this.data;

    if (!EMAIL_RE.test(email)) {
      wx.showToast({ title: '请输入正确的邮箱地址', icon: 'none' });
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      wx.showToast({ title: '邮箱验证码是 6 位数字', icon: 'none' });
      return;
    }
    if (password.length < 8) {
      wx.showToast({ title: '新密码至少 8 位', icon: 'none' });
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      wx.showToast({ title: '新密码需要同时包含字母和数字', icon: 'none' });
      return;
    }
    if (password !== password2) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      await request.post('/auth/password-reset', { email, code, new_password: password }, false);
      wx.showToast({ title: '密码已重置，请用新密码登录', icon: 'none', duration: 2000 });
      setTimeout(() => {
        wx.navigateBack({
          fail() {
            wx.reLaunch({ url: '/pages/login/login' });
          },
        });
      }, 1200);
    } catch (err) {
      request.toastError(err, '重置失败，请稍后再试');
    } finally {
      this.setData({ submitting: false });
    }
  },

  goLogin() {
    wx.navigateBack({
      fail() {
        wx.reLaunch({ url: '/pages/login/login' });
      },
    });
  },
});
