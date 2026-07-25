/**
 * 账号页（v3 A6，对齐 Web Account 页）：
 * 用户卡 + 我的点数卡 + 账号管理（更改用户名/绑定手机/更改邮箱/更改密码）
 * + 30 天复查提醒开关（含订阅消息授权口子：configs/public subscribe_template_id
 *   动态下发，空串不展示授权引导）+ 默认保留整理记录开关 + 隐私政策 + 退出登录。
 * 更改邮箱走 captcha-dialog 弹窗发码（scene=change_email），新邮箱失焦查重。
 */
const request = require('../../utils/request');
const { ensureLogin, startCountdown } = require('../../utils/auth');

const PHONE_RE = /^1\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[一-龥A-Za-z0-9_]{1,20}$/;

Page({
  data: {
    user: null,
    balance: 0,
    // 当前弹窗：username | phone | email | password | logout | null
    dialog: '',
    // 订阅消息模板 ID（空串 = 不展示授权引导）
    subscribeTemplateId: '',

    // 改用户名
    usernameValue: '',
    usernameState: 'idle', // idle | checking | ok | taken | invalid
    // 绑手机
    phoneValue: '',
    phoneCaptchaId: '',
    phoneCaptchaSvg: '',
    phoneCaptchaCode: '',
    // 改邮箱
    newEmail: '',
    emailCodeValue: '',
    emailState: 'idle',
    emailCountdown: 0,
    captchaOpen: false,
    // 改密码
    oldPwd: '',
    newPwd: '',
    newPwd2: '',
    submitting: false,
  },

  _cancelEmailCountdown: null,

  onUnload() {
    if (this._cancelEmailCountdown) this._cancelEmailCountdown();
  },

  onShow() {
    if (!ensureLogin()) return;
    this.loadProfile();
    // 订阅模板 ID：configs/public 动态下发（无鉴权），空串不展示
    if (!this.data.subscribeTemplateId) {
      request
        .get('/configs/public', {}, false)
        .then((d) => {
          const templateId = (d && d.subscribe_template_id) || '';
          this.setData({ subscribeTemplateId: templateId });
          getApp().globalData.subscribeTemplateId = templateId;
        })
        .catch(() => undefined);
    }
  },

  loadProfile() {
    request
      .get('/account/profile')
      .then((d) => {
        this.setData({ user: d.user, balance: d.points ? d.points.balance : 0 });
        const app = getApp();
        app.globalData.userInfo = d.user;
        app.globalData.balance = d.points ? d.points.balance : 0;
        wx.setStorageSync('userInfo', d.user);
      })
      .catch(() => undefined);
  },

  /* ============ 偏好开关（乐观更新 + 失败回滚） ============ */

  togglePref(key, value) {
    const prev = this.data.user;
    this.setData({ user: { ...prev, [key]: value } });
    request
      .put('/account/preferences', { [key]: value })
      .then((fresh) => this.setData({ user: fresh }))
      .catch((e) => {
        this.setData({ user: prev });
        request.toastError(e, '设置保存失败');
      });
  },

  onToggleReminder() {
    const next = this.data.user.reminder_enabled === 1 ? 0 : 1;
    this.togglePref('reminder_enabled', next);
  },

  onToggleKeepRecords() {
    // "默认保留整理记录" 开 = delete_after_analysis 0
    const next = this.data.user.delete_after_analysis === 0 ? 1 : 0;
    this.togglePref('delete_after_analysis', next);
  },

  /* ============ 订阅消息授权口子（模板 ID 非空才展示） ============ */

  onSubscribeReminder() {
    const templateId = this.data.subscribeTemplateId;
    if (!templateId) return;
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (res) => {
        if (res[templateId] === 'accept') {
          wx.showToast({ title: '已订阅，30 天后微信里也会提醒你', icon: 'none', duration: 2500 });
        } else {
          wx.showToast({ title: '没订阅也没关系，站内消息照样提醒你', icon: 'none', duration: 2500 });
        }
      },
      fail: () => {
        wx.showToast({ title: '订阅失败，站内消息照样提醒你', icon: 'none' });
      },
    });
  },

  /* ============ 弹窗开关 ============ */

  openDialog(e) {
    const kind = e.currentTarget.dataset.kind || e;
    this.setData({ dialog: kind });
    if (kind === 'username') {
      this.setData({ usernameValue: this.data.user.username || '', usernameState: 'idle' });
    } else if (kind === 'phone') {
      this.setData({ phoneValue: '', phoneCaptchaCode: '' });
      this.refreshPhoneCaptcha();
    } else if (kind === 'email') {
      this.setData({ newEmail: '', emailCodeValue: '', emailState: 'idle' });
    } else if (kind === 'password') {
      this.setData({ oldPwd: '', newPwd: '', newPwd2: '' });
    }
  },

  closeDialog() {
    this.setData({ dialog: '' });
  },

  noop() {},

  /* ============ 更改用户名 ============ */

  onUsernameInput(e) {
    this.setData({ usernameValue: e.detail.value || '', usernameState: 'idle' });
  },

  async onUsernameBlur() {
    const value = this.data.usernameValue;
    if (!value) {
      this.setData({ usernameState: 'idle' });
      return;
    }
    if (!USERNAME_RE.test(value)) {
      this.setData({ usernameState: 'invalid' });
      return;
    }
    this.setData({ usernameState: 'checking' });
    try {
      const r = await request.get('/auth/check-username', { value }, false);
      this.setData({ usernameState: r.available ? 'ok' : 'taken' });
    } catch (e) {
      this.setData({ usernameState: 'idle' });
    }
  },

  async onUsernameSubmit() {
    const value = this.data.usernameValue;
    if (!USERNAME_RE.test(value)) {
      wx.showToast({ title: '用户名 1-20 字，支持中文/英文/数字/下划线', icon: 'none' });
      return;
    }
    if (this.data.usernameState === 'taken') {
      wx.showToast({ title: '这个用户名被占了', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const fresh = await request.put('/account/username', { username: value });
      wx.showToast({ title: '用户名已更新', icon: 'none' });
      this.setData({ user: fresh, dialog: '' });
      getApp().globalData.userInfo = fresh;
      wx.setStorageSync('userInfo', fresh);
    } catch (e) {
      request.toastError(e, '更新失败');
    } finally {
      this.setData({ submitting: false });
    }
  },

  /* ============ 绑定/修改手机号 ============ */

  refreshPhoneCaptcha() {
    request
      .get('/captcha', {}, false)
      .then((d) => {
        this.setData({
          phoneCaptchaId: d.captcha_id || '',
          phoneCaptchaSvg: d.svg || d.svg_data_url || '',
          phoneCaptchaCode: '',
        });
      })
      .catch(() => this.setData({ phoneCaptchaSvg: '' }));
  },

  onPhoneInput(e) {
    this.setData({ phoneValue: (e.detail.value || '').replace(/\D/g, '') });
  },

  onPhoneCaptchaCodeInput(e) {
    this.setData({ phoneCaptchaCode: (e.detail.value || '').trim() });
  },

  async onPhoneSubmit() {
    const { phoneValue, phoneCaptchaId, phoneCaptchaCode } = this.data;
    if (!PHONE_RE.test(phoneValue)) {
      wx.showToast({ title: '请输入 11 位手机号', icon: 'none' });
      return;
    }
    if (!phoneCaptchaId || !phoneCaptchaCode) {
      wx.showToast({ title: '请先完成图形验证', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const fresh = await request.put('/account/phone', {
        phone: phoneValue,
        captcha_id: phoneCaptchaId,
        captcha_code: phoneCaptchaCode,
      });
      wx.showToast({ title: '手机号已绑定', icon: 'none' });
      this.setData({ user: fresh, dialog: '' });
      getApp().globalData.userInfo = fresh;
      wx.setStorageSync('userInfo', fresh);
    } catch (e) {
      this.refreshPhoneCaptcha();
      request.toastError(e, '绑定失败');
    } finally {
      this.setData({ submitting: false });
    }
  },

  /* ============ 更改邮箱（弹窗发码 scene=change_email） ============ */

  onNewEmailInput(e) {
    this.setData({ newEmail: (e.detail.value || '').trim(), emailState: 'idle' });
  },

  async onNewEmailBlur() {
    const newEmail = this.data.newEmail;
    if (!newEmail) {
      this.setData({ emailState: 'idle' });
      return;
    }
    if (!EMAIL_RE.test(newEmail) || newEmail === (this.data.user.email || '')) {
      this.setData({ emailState: 'invalid' });
      return;
    }
    this.setData({ emailState: 'checking' });
    try {
      const r = await request.get('/auth/check-email', { value: newEmail }, false);
      this.setData({ emailState: r.available ? 'ok' : 'taken' });
    } catch (e) {
      this.setData({ emailState: 'idle' });
    }
  },

  onEmailCodeInput(e) {
    this.setData({ emailCodeValue: (e.detail.value || '').replace(/\D/g, '') });
  },

  /** 点「发送验证码」：本地校验 → 开图形码弹窗 */
  openEmailCaptcha() {
    const newEmail = this.data.newEmail;
    if (!EMAIL_RE.test(newEmail)) {
      wx.showToast({ title: '请输入正确的新邮箱', icon: 'none' });
      return;
    }
    if (newEmail === (this.data.user.email || '')) {
      wx.showToast({ title: '新邮箱和当前邮箱一样哦', icon: 'none' });
      return;
    }
    if (this.data.emailState === 'taken') {
      wx.showToast({ title: '这个邮箱已被其他账号绑定', icon: 'none' });
      return;
    }
    this.setData({ captchaOpen: true });
  },

  onCaptchaClose() {
    this.setData({ captchaOpen: false });
  },

  /** 图形码通过后发码（POST /account/email-code，scene=change_email） */
  onCaptchaVerified(e) {
    const { captchaId, captchaCode } = e.detail;
    this.setData({ captchaOpen: false });
    request
      .post('/account/email-code', {
        new_email: this.data.newEmail,
        scene: 'change_email',
        captcha_id: captchaId,
        captcha_code: captchaCode,
      })
      .then(() => {
        wx.showToast({ title: '验证码已发送至新邮箱', icon: 'none', duration: 2000 });
        if (this._cancelEmailCountdown) this._cancelEmailCountdown();
        this._cancelEmailCountdown = startCountdown((n) => this.setData({ emailCountdown: n }));
      })
      .catch((err) => {
        if (err && err.code === 2101) {
          this.setData({ captchaOpen: true });
          wx.showToast({ title: '图形验证码不对，再来一次', icon: 'none' });
        } else {
          if (err && err.code === 2105) this.setData({ emailState: 'taken' });
          request.toastError(err, '发送失败');
        }
      });
  },

  async onEmailSubmit() {
    const { newEmail, emailCodeValue, emailState } = this.data;
    if (!EMAIL_RE.test(newEmail)) {
      wx.showToast({ title: '请输入正确的新邮箱', icon: 'none' });
      return;
    }
    if (emailState === 'taken') {
      wx.showToast({ title: '这个邮箱已被其他账号绑定', icon: 'none' });
      return;
    }
    if (!/^\d{6}$/.test(emailCodeValue)) {
      wx.showToast({ title: '验证码是 6 位数字', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const fresh = await request.put('/account/email', { new_email: newEmail, code: emailCodeValue });
      wx.showToast({ title: '邮箱已换绑，下次登录请用新邮箱', icon: 'none', duration: 2500 });
      this.setData({ user: fresh, dialog: '' });
      getApp().globalData.userInfo = fresh;
      wx.setStorageSync('userInfo', fresh);
    } catch (e2) {
      request.toastError(e2, '换绑失败');
    } finally {
      this.setData({ submitting: false });
    }
  },

  /* ============ 更改密码 ============ */

  onOldPwdInput(e) {
    this.setData({ oldPwd: e.detail.value || '' });
  },

  onNewPwdInput(e) {
    this.setData({ newPwd: e.detail.value || '' });
  },

  onNewPwd2Input(e) {
    this.setData({ newPwd2: e.detail.value || '' });
  },

  async onPasswordSubmit() {
    const { oldPwd, newPwd, newPwd2 } = this.data;
    if (!oldPwd) {
      wx.showToast({ title: '请输入当前密码', icon: 'none' });
      return;
    }
    if (newPwd.length < 8) {
      wx.showToast({ title: '新密码至少 8 位', icon: 'none' });
      return;
    }
    if (!/[A-Za-z]/.test(newPwd) || !/\d/.test(newPwd)) {
      wx.showToast({ title: '新密码需要同时包含字母和数字', icon: 'none' });
      return;
    }
    if (newPwd !== newPwd2) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      await request.put('/account/password', { old_password: oldPwd, new_password: newPwd });
      wx.showToast({ title: '密码已更新', icon: 'none' });
      this.setData({ dialog: '' });
    } catch (e) {
      request.toastError(e, '修改失败');
    } finally {
      this.setData({ submitting: false });
    }
  },

  /* ============ 其他入口 ============ */

  goPoints() {
    wx.navigateTo({ url: '/pages/points/points' });
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/webview/webview?page=privacy' });
  },

  onLogoutConfirm() {
    getApp().clearSession();
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
