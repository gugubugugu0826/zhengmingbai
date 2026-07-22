/**
 * webview 占位页（一期）
 *
 * 说明：完整的拍照 → AI 识别 → 入柜流程在一期复用 H5（zhengmingbai/web/）。
 * 小程序内通过 web-view 承载 H5 页面（真机需把 H5 域名配置为小程序「业务域名」）。
 * 开发工具里 localhost 无法作为业务域名校验，故默认展示说明文案，
 * 预留 web-view 组件，待 H5 部署到 https 域名后打开开关即可。
 */
const { H5_BASE } = require('../../utils/config');

Page({
  data: {
    /** 是否启用 web-view（H5 部署到已配置业务域名后改为 true） */
    webviewEnabled: false,
    /** web-view 加载的 H5 地址（携带 token 供 H5 免登） */
    webviewUrl: '',
  },

  onLoad() {
    const token = getApp().globalData.token || wx.getStorageSync('token');
    this.setData({
      webviewUrl: `${H5_BASE}?from=miniprogram&token=${encodeURIComponent(token || '')}`,
    });
  },
});
