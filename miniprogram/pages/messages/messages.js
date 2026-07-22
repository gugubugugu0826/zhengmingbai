/**
 * 站内消息（v3，对齐 Web Messages 页 §5-I-3）：
 * 四个筛选 Tab：全部 / 复查提醒 / 点数变动 / 系统通知（前端按 type 过滤）。
 * "去看看"跳 link（如 /spaces?focus={spaceId}），"我知道了"标已读；
 * 未读左侧主色条 + 红点。
 */
const request = require('../../utils/request');
const { ensureLogin } = require('../../utils/auth');
const { MESSAGE_TABS, matchMessageTab, formatDateTime } = require('../../utils/constants');

const TYPE_ICONS = {
  reminder: '🔁',
  points: '🪙',
  system: '📢',
};

function iconOf(msg) {
  if (matchMessageTab(msg, 'reminder')) return TYPE_ICONS.reminder;
  if (matchMessageTab(msg, 'points')) return TYPE_ICONS.points;
  return TYPE_ICONS.system;
}

Page({
  data: {
    tabs: MESSAGE_TABS,
    tab: 'all',
    messages: null,
    filtered: [],
  },

  onLoad() {
    if (!ensureLogin()) return;
    this.load();
  },

  load() {
    request
      .get('/messages')
      .then((list) => {
        const messages = (Array.isArray(list) ? list : []).map((m) => ({
          ...m,
          icon: iconOf(m),
          timeText: formatDateTime(m.created_at),
        }));
        this.setData({ messages });
        this.applyFilter();
      })
      .catch((e) => {
        this.setData({ messages: [] });
        this.applyFilter();
        request.toastError(e, '消息加载失败');
      });
  },

  onSwitchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.key });
    this.applyFilter();
  },

  applyFilter() {
    const { messages, tab } = this.data;
    const filtered = (messages || []).filter((m) => matchMessageTab(m, tab));
    this.setData({ filtered });
  },

  /** 标已读 */
  async markRead(msg) {
    if (msg.is_read === 1) return;
    try {
      await request.post(`/messages/${msg.id}/read`);
      const messages = (this.data.messages || []).map((m) =>
        m.id === msg.id ? { ...m, is_read: 1 } : m,
      );
      this.setData({ messages });
      this.applyFilter();
    } catch (e) {
      // 已读失败不打扰用户
    }
  },

  onMarkRead(e) {
    const id = e.currentTarget.dataset.id;
    const msg = (this.data.messages || []).find((m) => m.id === id);
    if (msg) this.markRead(msg);
  },

  /** "去看看"：标已读 + 跳 link（站内路由转小程序页面路径） */
  async onOpen(e) {
    const id = e.currentTarget.dataset.id;
    const msg = (this.data.messages || []).find((m) => m.id === id);
    if (!msg) return;
    await this.markRead(msg);
    if (!msg.link) return;
    // link 形如 /spaces?focus={spaceId}
    if (msg.link.indexOf('/spaces') === 0) {
      const query = msg.link.indexOf('?') >= 0 ? msg.link.slice(msg.link.indexOf('?')) : '';
      wx.switchTab({ url: `/pages/spaces/spaces${query}` });
    } else if (msg.link.indexOf('/points') === 0) {
      wx.navigateTo({ url: '/pages/points/points' });
    } else if (msg.link.indexOf('/messages') === 0) {
      // 已在消息页
    } else {
      // 未知 link 跳首页
      wx.switchTab({ url: '/pages/home/home' });
    }
  },
});
