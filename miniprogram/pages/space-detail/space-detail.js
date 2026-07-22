/**
 * 空间详情页（v3 §5-F 前后对比，对齐 Web SpaceDetail 页）：
 * GET /spaces/:id 返回 photos（整理前）+ after_photos（整理后）签名 URL 数组，
 * 两栏并排展示；下方为该空间历次整理记录时间线。
 * "AI 帮你对比"本轮不做（501 口子），引导文案：拍张整理后的照片就能对比。
 */
const request = require('../../utils/request');
const { ensureLogin } = require('../../utils/auth');
const { formatDate, SPACE_TYPE_LABELS, SESSION_STATUS_LABELS } = require('../../utils/constants');

Page({
  data: {
    spaceId: '',
    detail: null,
    history: null,
    typeLabel: '',
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    const spaceId = (options && options.id) || '';
    this.setData({ spaceId });

    request
      .get(`/spaces/${spaceId}`)
      .then((detail) => {
        this.setData({
          detail,
          typeLabel: SPACE_TYPE_LABELS[detail.space_type] || '空间',
        });
      })
      .catch((e) => {
        request.toastError(e, '空间加载失败');
        setTimeout(() => wx.navigateBack(), 800);
      });

    request
      .get(`/spaces/${spaceId}/history`)
      .then((history) => {
        const list = (Array.isArray(history) ? history : []).map((r) => ({
          ...r,
          dateText: formatDate(r.created_at),
          statusLabel: SESSION_STATUS_LABELS[r.status] || r.status,
          granularityLabel: r.granularity === 'item' ? '物品级' : '区域级',
        }));
        this.setData({ history: list });
      })
      .catch(() => this.setData({ history: [] }));
  },

  /** 按会话状态跳对应流程页 */
  openRecord(e) {
    const id = e.currentTarget.dataset.id;
    const status = e.currentTarget.dataset.status;
    if (status === 'done' || status === 'executing') {
      wx.navigateTo({ url: `/pages/todo/todo?sessionId=${id}` });
    } else if (status === 'planned') {
      wx.navigateTo({ url: `/pages/plan/plan?sessionId=${id}` });
    } else {
      wx.navigateTo({ url: `/pages/confirm/confirm?sessionId=${id}` });
    }
  },

  /** 照片大图预览 */
  previewPhoto(e) {
    const url = e.currentTarget.dataset.url;
    const group = e.currentTarget.dataset.group;
    const urls = group === 'after' ? this.data.detail.after_photos : this.data.detail.photos;
    wx.previewImage({ current: url, urls });
  },
});
