/**
 * webview 页（v3 保留，H5 备用承载）：
 * - 默认展示小程序原生「隐私政策」（账号页入口，文案与 Web Privacy 页口径一致）
 * - 当 H5 部署到已配置业务域名后，把 webviewEnabled 置为 true 即可内嵌打开完整 H5
 */
const { H5_BASE } = require('../../utils/config');

Page({
  data: {
    /** 是否启用 web-view（H5 部署到已配置业务域名后改为 true） */
    webviewEnabled: false,
    /** web-view 加载的 H5 地址（携带 token 供 H5 免登） */
    webviewUrl: '',
  },

  onLoad(options) {
    const token = getApp().globalData.token || wx.getStorageSync('token');
    const page = options && options.page ? options.page : '';
    const pagePath = page === 'privacy' ? '/privacy' : '';
    this.setData({
      webviewUrl: `${H5_BASE}${pagePath}?from=miniprogram&token=${encodeURIComponent(token || '')}`,
    });
  },
});
