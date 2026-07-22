/**
 * 登录页（v3 §四 验证码新规则，对齐 Web Login 页）：
 * - 两个 Tab：「邮箱验证码」「密码登录」
 * - 邮箱验证码 Tab：点「发送验证码」弹 captcha-dialog 图形码弹窗，表单内不常驻图形码；
 *   登录提交复用发码时已消耗的图形码参数（后端校验链只认一次性，提交失败 2101 重开弹窗）
 * - 密码登录 Tab：三行式——账号（邮箱或手机号，按格式自动选 login_type）/ 密码 / 常驻图形验证码
 * - 「忘记密码」入口 → /pages/forgot-password/forgot-password
 * - 登录失败统一提示，不区分账号/密码/验证码错（防枚举）
 */
const request = require('../../utils/request');
const { startCountdown } = require('../../utils/auth');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^1\d{10}$/;

Page({
  data: {
    /** 当前 Tab：email_code | password */
    tab: 'email_code',
    submitting: false,

    // 邮箱验证码 Tab
    email: '',
    emailCode: '',
    countdown: 0,
    captchaOpen: false,
    /** 发码成功后保留的图形码参数（提交登录时复用） */
    codeCaptchaId: '',
    codeCaptchaCode: '',

    // 密码登录 Tab
    account: '',
    password: '',
    pwdCaptchaId: '',
    pwdCaptchaSvg: '',
    pwdCaptchaCode: '',
  },

  _cancelCountdown: null,

  onUnload() {
    if (this._cancelCountdown) this._cancelCountdown();
  },

  onLoad() {
    this.refreshPwdCaptcha();
  },

  /* ============ Tab 切换 ============ */

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab });
    if (tab === 'password' && !this.data.pwdCaptchaSvg) {
      this.refreshPwdCaptcha();
    }
  },

  /* ============ 输入 ============ */

  onEmailInput(e) {
    this.setData({ email: (e.detail.value || '').trim() });
  },

  onEmailCodeInput(e) {
    this.setData({ emailCode: (e.detail.value || '').replace(/\D/g, '') });
  },

  onAccountInput(e) {
    this.setData({ account: (e.detail.value || '').trim() });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value || '' });
  },

  onPwdCaptchaCodeInput(e) {
    this.setData({ pwdCaptchaCode: (e.detail.value || '').trim() });
  },

  /* ============ 密码 Tab：常驻图形码 ============ */

  refreshPwdCaptcha() {
    request
      .get('/captcha', {}, false)
      .then((d) => {
        this.setData({
          pwdCaptchaId: d.captcha_id || '',
          pwdCaptchaSvg: d.svg || d.svg_data_url || '',
          pwdCaptchaCode: '',
        });
      })
      .catch(() => {
        this.setData({ pwdCaptchaSvg: '' });
      });
  },

  /* ============ 邮箱码 Tab：弹窗发码 ============ */

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

  /** 图形码通过后发码（scene=login） */
  onCaptchaVerified(e) {
    const { captchaId, captchaCode } = e.detail;
    this.setData({ captchaOpen: false });
    request
      .post(
        '/auth/email-code',
        {
          email: this.data.email,
          scene: 'login',
          captcha_id: captchaId,
          captcha_code: captchaCode,
        },
        false,
      )
      .then(() => {
        wx.showToast({ title: '验证码已发送，5 分钟内有效', icon: 'none', duration: 2000 });
        this.setData({ codeCaptchaId: captchaId, codeCaptchaCode: captchaCode });
        if (this._cancelCountdown) this._cancelCountdown();
        this._cancelCountdown = startCountdown((n) => this.setData({ countdown: n }));
      })
      .catch((err) => {
        this.setData({ codeCaptchaId: '', codeCaptchaCode: '' });
        if (err && err.code === 2101) {
          // 图形码一用即废：2101 时重开弹窗（自动刷新新码）
          this.setData({ captchaOpen: true });
          wx.showToast({ title: '图形验证码不对，再来一次', icon: 'none' });
        } else {
          request.toastError(err, '发送失败，请稍后再试');
        }
      });
  },

  /* ============ 提交登录 ============ */

  async onSubmit() {
    if (this.data.submitting) return;

    const { tab, email, emailCode, account, password, pwdCaptchaId, pwdCaptchaCode } = this.data;
    let body;

    if (tab === 'email_code') {
      if (!EMAIL_RE.test(email)) {
        wx.showToast({ title: '请输入正确的邮箱地址', icon: 'none' });
        return;
      }
      if (!/^\d{6}$/.test(emailCode)) {
        wx.showToast({ title: '邮箱验证码是 6 位数字', icon: 'none' });
        return;
      }
      if (!this.data.codeCaptchaId) {
        wx.showToast({ title: '请先点「发送验证码」获取邮箱验证码', icon: 'none' });
        return;
      }
      body = {
        login_type: 'email_code',
        email,
        email_code: emailCode,
        captcha_id: this.data.codeCaptchaId,
        captcha_code: this.data.codeCaptchaCode,
      };
    } else {
      if (!account) {
        wx.showToast({ title: '请输入邮箱或手机号', icon: 'none' });
        return;
      }
      if (!password) {
        wx.showToast({ title: '请输入密码', icon: 'none' });
        return;
      }
      if (!pwdCaptchaId || !pwdCaptchaCode) {
        wx.showToast({ title: '请先输入图形验证码', icon: 'none' });
        return;
      }
      // 账号框可输邮箱或手机号：按格式自动选择 login_type
      if (EMAIL_RE.test(account)) {
        body = {
          login_type: 'email_password',
          email: account,
          password,
          captcha_id: pwdCaptchaId,
          captcha_code: pwdCaptchaCode,
        };
      } else if (PHONE_RE.test(account)) {
        body = {
          login_type: 'phone_password',
          phone: account,
          password,
          captcha_id: pwdCaptchaId,
          captcha_code: pwdCaptchaCode,
        };
      } else {
        wx.showToast({ title: '账号格式不对：请输入邮箱或 11 位手机号', icon: 'none' });
        return;
      }
    }

    this.setData({ submitting: true });
    try {
      const data = await request.post('/auth/login', body, false);
      const token = data && data.token;
      if (!token) {
        throw new Error('登录响应缺少 token');
      }
      const balance = data && data.points ? data.points.balance : 0;
      getApp().setSession(token, data.user || null, balance);
      wx.showToast({ title: '欢迎回来～', icon: 'success' });
      wx.switchTab({ url: '/pages/home/home' });
    } catch (err) {
      // 图形码一次性作废：密码登录失败后必须让用户重新过码
      if (tab === 'password') {
        this.refreshPwdCaptcha();
      } else if (err && err.code === 2101) {
        this.setData({ codeCaptchaId: '', codeCaptchaCode: '', captchaOpen: true });
        wx.showToast({ title: '图形验证码过期了，请重新发送验证码', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }
      if (err && (err.code === 2001 || err.code === 2102)) {
        if (tab === 'email_code' && /注册/.test(err.message || '')) {
          wx.showToast({ title: '这个邮箱还没注册，先去网页端注册吧', icon: 'none', duration: 2500 });
        } else {
          wx.showToast({ title: '账号或凭据不正确，请重试', icon: 'none' });
        }
      } else {
        request.toastError(err, '登录失败，请稍后再试');
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  /* ============ 忘记密码入口 ============ */

  goForgotPassword() {
    wx.navigateTo({ url: '/pages/forgot-password/forgot-password' });
  },
});
