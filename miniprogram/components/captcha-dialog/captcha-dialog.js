/**
 * v3 图形验证码弹窗（验证码新规则核心组件，4 处发信动作复用）：
 * 登录邮箱验证码 / 忘记密码 / 更改邮箱——点击「发送验证码」时弹出本组件，
 * 校验通过后才调发信接口；表单内不常驻图形码。
 *
 * 用法：
 *   // page.json: "usingComponents": { "captcha-dialog": "/components/captcha-dialog/captcha-dialog" }
 *   // page.wxml:
 *   <captcha-dialog visible="{{captchaOpen}}" subtitle="通过人机验证后，验证码就发到你的邮箱"
 *     bind:close="onCaptchaClose" bind:verified="onCaptchaVerified" />
 *   // page.js: onCaptchaVerified(e) { const { captchaId, captchaCode } = e.detail; ... }
 *
 * 注意：图形码一用即废。若发信接口返回 2101（图形码错误），重新打开弹窗即可（会自动刷新）。
 */
const request = require('../../utils/request');

Component({
  properties: {
    /** 是否展示弹窗 */
    visible: {
      type: Boolean,
      value: false,
      observer(newVal) {
        if (newVal) {
          this.refresh();
        }
      },
    },
    /** 弹窗副标题 */
    subtitle: {
      type: String,
      value: '先过一下人机验证',
    },
  },

  data: {
    captchaId: '',
    /** 后端返回 svg（svg_data_url 或 svg 字段，兼容两种命名） */
    svg: '',
    code: '',
    loading: false,
    error: '',
  },

  methods: {
    /** 拉一张新图形码 */
    refresh() {
      this.setData({ loading: true, error: '' });
      request
        .get('/captcha', {}, false)
        .then((d) => {
          this.setData({
            captchaId: d.captcha_id || '',
            svg: d.svg || d.svg_data_url || '',
            code: '',
            loading: false,
          });
        })
        .catch(() => {
          this.setData({ svg: '', loading: false, error: '验证码加载失败，点图片重试' });
        });
    },

    onCodeInput(e) {
      this.setData({ code: (e.detail.value || '').trim(), error: '' });
    },

    onClose() {
      this.triggerEvent('close');
    },

    /** 阻止内容区点击穿透到遮罩 */
    noop() {},

    onConfirm() {
      const { captchaId, code } = this.data;
      if (!code) {
        this.setData({ error: '先输入图片里的字符' });
        return;
      }
      if (!captchaId) {
        this.setData({ error: '验证码还没加载好，点图片刷新一下' });
        return;
      }
      this.triggerEvent('verified', { captchaId, captchaCode: code });
    },
  },
});
