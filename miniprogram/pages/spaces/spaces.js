/**
 * 我的空间（v3，对齐 Web Spaces 页 + 状态机 §五-I-2）：
 * 空间卡片列表，点击进入空间详情页（前后对比 + 整理记录时间线）。
 * 空间状态：待执行 / 执行中 / 已完成（取该空间最近一次会话，已采纳未开始=待执行；
 * 有勾选=执行中；全勾=已完成，实时计算）。
 * 支持 ?focus={spaceId}（30 天提醒消息 link 跳转定位）。
 */
const request = require('../../utils/request');
const { ensureLogin } = require('../../utils/auth');
const {
  spaceEmoji,
  formatLastTime,
  SPACE_TYPE_LABELS,
  SPACE_STATUS,
} = require('../../utils/constants');

Page({
  data: {
    spaces: null,
    focusId: 0,
  },

  onLoad(options) {
    const focusId = options && options.focus ? Number(options.focus) : 0;
    this.setData({ focusId });
  },

  onShow() {
    if (!ensureLogin()) return;
    this.load();
  },

  onPullDownRefresh() {
    this.load().finally(() => wx.stopPullDownRefresh());
  },

  async load() {
    try {
      const spaces = await request.get('/spaces');
      const list = Array.isArray(spaces) ? spaces : [];
      // 逐空间拉最近一次整理记录计算状态机（history 第 0 条即最新）
      const enriched = await Promise.all(
        list.map(async (s) => {
          let status = '';
          try {
            const history = await request.get(`/spaces/${s.id}/history`);
            const records = Array.isArray(history) ? history : [];
            const latest = records[0];
            if (latest) {
              if (latest.status === 'done') {
                status = SPACE_STATUS.DONE;
              } else if (latest.status === 'executing') {
                status = SPACE_STATUS.DOING;
              } else if (latest.status === 'planned' || latest.status === 'confirming') {
                status = SPACE_STATUS.PENDING;
              }
            }
          } catch (e) {
            // 状态拉取失败不阻塞列表
          }
          return {
            ...s,
            emoji: spaceEmoji(s.space_type),
            typeLabel: SPACE_TYPE_LABELS[s.space_type] || '空间',
            lastTimeText: formatLastTime(s.last_session_at),
            status,
            focused: this.data.focusId === s.id,
          };
        }),
      );
      this.setData({ spaces: enriched });
    } catch (e) {
      this.setData({ spaces: [] });
      request.toastError(e, '空间列表加载失败');
    }
  },

  goSpaceDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/space-detail/space-detail?id=${id}` });
  },

  goCapture() {
    wx.navigateTo({ url: '/pages/capture/capture' });
  },
});
