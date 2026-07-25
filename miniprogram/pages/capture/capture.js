/**
 * 拍照页（v3，对齐 Web Capture 页）：
 * 选空间类型（10 种完整，D10）→ 拍照/相册上传（1-20 张，wx.chooseMedia + base64）
 * → 存草稿进确认页（偏好在确认页选定后才创建会话并上传照片）。
 * 首次进入贴士浮层（storage 记忆）。
 */
const { ensureLogin } = require('../../utils/auth');
const { SPACE_CHOICES, MAX_PHOTOS } = require('../../utils/constants');

const TIPS = [
  { title: '把柜门抽屉都打开', desc: '光线亮一点，AI 看得更清楚～' },
  { title: '全景 + 特写都来几张', desc: '先拍整体，再拍最乱的角落。' },
  { title: '一次最多 20 张', desc: '拍得全一点，方案会更准哦。' },
];

let photoSeq = 1;

Page({
  data: {
    spaceChoices: SPACE_CHOICES,
    spaceType: '',
    /** 本地照片：{ id, path } */
    photos: [],
    maxPhotos: MAX_PHOTOS,
    keepPhotos: true,
    // 贴士浮层
    showTips: false,
    tipIndex: 0,
    tip: TIPS[0],
    tipLast: false,
  },

  onLoad() {
    if (!ensureLogin()) return;
    // R49/PRD 4.2：默认勾选保留；全局偏好 delete_after_analysis=1 时默认不勾选
    const userInfo = getApp().globalData.userInfo || wx.getStorageSync('userInfo') || {};
    this.setData({
      keepPhotos: userInfo.delete_after_analysis !== 1,
      showTips: wx.getStorageSync('capture_tips_seen') !== '1',
    });
  },

  /* ============ 贴士浮层 ============ */

  onTipNext() {
    const next = this.data.tipIndex + 1;
    if (next >= TIPS.length) {
      this.closeTips();
      return;
    }
    this.setData({ tipIndex: next, tip: TIPS[next], tipLast: next === TIPS.length - 1 });
  },

  closeTips() {
    wx.setStorageSync('capture_tips_seen', '1');
    this.setData({ showTips: false });
  },

  /* ============ 空间类型 ============ */

  onPickSpaceType(e) {
    this.setData({ spaceType: e.currentTarget.dataset.type });
  },

  /* ============ 拍照 / 相册 ============ */

  /** wx.chooseMedia（基础库 2.10+），sourceType 拍照或相册 */
  pickImages(sourceType) {
    const remain = MAX_PHOTOS - this.data.photos.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多 ${MAX_PHOTOS} 张哦`, icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: Math.min(remain, 9), // 微信单次最多 9 张
      mediaType: ['image'],
      sourceType: [sourceType],
      sizeType: ['compressed'], // 压缩图，控制 base64 体积
      success: (res) => {
        const files = (res.tempFiles || []).slice(0, remain);
        const loaded = files.map((f) => ({
          id: photoSeq++,
          path: f.tempFilePath,
        }));
        this.setData({ photos: this.data.photos.concat(loaded) });
        if ((res.tempFiles || []).length > remain) {
          wx.showToast({ title: `最多 ${MAX_PHOTOS} 张，多出来的没加上`, icon: 'none' });
        }
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') < 0) {
          wx.showToast({ title: '选图失败，再试一次', icon: 'none' });
        }
      },
    });
  },

  onCamera() {
    this.pickImages('camera');
  },

  onAlbum() {
    this.pickImages('album');
  },

  onRemovePhoto(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ photos: this.data.photos.filter((p) => p.id !== id) });
  },

  onToggleKeep() {
    this.setData({ keepPhotos: !this.data.keepPhotos });
  },

  /* ============ 下一步：存草稿进确认页 ============ */

  onNext() {
    const { spaceType, photos, keepPhotos } = this.data;
    if (!spaceType) {
      wx.showToast({ title: '先选一个空间类型吧', icon: 'none' });
      return;
    }
    if (photos.length === 0) {
      wx.showToast({ title: '先拍至少 1 张照片哦', icon: 'none' });
      return;
    }
    // 草稿存全局（照片是本地临时路径，确认页转 base64 上传）
    getApp().captureDraft = {
      spaceType,
      photoPaths: photos.map((p) => p.path),
      keepPhotos: keepPhotos ? 1 : 0,
    };
    wx.navigateTo({ url: '/pages/confirm/confirm?sessionId=new' });
  },
});
