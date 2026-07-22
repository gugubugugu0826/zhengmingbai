/**
 * 方案页（v3，对齐 Web Plan 页）：
 * 示意插画 + 五部分方案（丢弃建议可采纳/拒绝/修改——保留「写反馈修改」交互 D4）
 * + 重生成（异步任务轮询）+ 定格生成最终方案 + 找人帮我整理（筹备中）。
 */
const request = require('../../utils/request');
const { ensureLogin } = require('../../utils/auth');

/** 轮询重生成任务直至 done/failed（每 2s 一次，最多 2 分钟兜底） */
function pollRegenTask(taskId) {
  const deadline = Date.now() + 120000;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const task = await request.get(`/plans/regen-tasks/${taskId}`);
        if (task.status === 'done' || task.status === 'failed') {
          resolve(task);
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error('等待超时，请稍后刷新页面看看'));
          return;
        }
        setTimeout(tick, 2000);
      } catch (e) {
        reject(e);
      }
    };
    tick();
  });
}

Page({
  data: {
    sessionId: '',
    session: null,
    plan: null,
    /** 丢弃建议条目（items 中 item_type==='discard'） */
    discardItems: [],
    /** 输出形式 */
    showAnnotation: false,
    regenCostLabel: '重新生成',
    busy: false,
    regenerating: false,
    // 写反馈修改（D4）：正在编辑的条目 id 与草稿
    editingItemId: 0,
    editingNote: '',
    itemBusy: false,
    // 找人帮我整理
    showComingSoon: false,
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    const sessionId = (options && options.sessionId) || '';
    this.setData({ sessionId });
    this.load();
  },

  async load() {
    try {
      const detail = await request.get(`/sessions/${this.data.sessionId}`);
      if (!detail.plan) {
        wx.redirectTo({ url: `/pages/confirm/confirm?sessionId=${this.data.sessionId}` });
        return;
      }
      this.applyDetail(detail);

      // 刷新页面恢复进行中的重生成任务（pending/processing 续轮询）
      const active = detail.active_regen_task;
      if (active && (active.status === 'pending' || active.status === 'processing')) {
        this.setData({ regenerating: true });
        try {
          const task = await pollRegenTask(active.id);
          await this.applyRegenResult(task);
        } catch (e) {
          request.toastError(e, '任务状态查询失败，请刷新重试');
        } finally {
          this.setData({ regenerating: false });
        }
      }
    } catch (e) {
      request.toastError(e, '方案加载失败');
      setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 800);
    }
  },

  /** 套用会话详情到视图数据 */
  applyDetail(detail) {
    const plan = detail.plan;
    const discardItems = (plan.items || [])
      .filter((i) => i.item_type === 'discard')
      .map((i) => ({
        id: i.id,
        status: i.status,
        user_note: i.user_note || '',
        itemName: (i.content && i.content.item) || '这件物品',
        reason: (i.content && i.content.reason) || '',
      }));
    let outputForms = [];
    try {
      outputForms = JSON.parse(detail.output_forms || '[]');
    } catch (e) {
      outputForms = [];
    }
    this.setData({
      session: detail,
      plan,
      discardItems,
      showAnnotation: outputForms.indexOf('annotation') >= 0,
    });
    request
      .get(`/plans/${plan.id}/regen-cost`)
      .then((cost) => this.setData({ regenCostLabel: (cost && cost.label) || '重新生成' }))
      .catch(() => undefined);
  },

  /* ============ 丢弃建议：采纳 / 拒绝 / 写反馈修改（D4） ============ */

  async actOnItem(itemId, status, note) {
    if (this.data.itemBusy) return;
    if (status === 'modified' && !(note || '').trim()) {
      wx.showToast({ title: '修改建议时请写上你的想法哦', icon: 'none' });
      return;
    }
    this.setData({ itemBusy: true });
    try {
      await request.patch(`/plans/items/${itemId}`, {
        status,
        ...(status === 'modified' ? { user_note: note.trim() } : {}),
      });
      wx.showToast({
        title: status === 'accepted' ? '已采纳' : status === 'rejected' ? '已拒绝这条建议' : '已记下你的修改',
        icon: 'none',
      });
      this.setData({ editingItemId: 0, editingNote: '' });
      await this.load();
    } catch (e) {
      request.toastError(e, '操作失败');
    } finally {
      this.setData({ itemBusy: false });
    }
  },

  onAcceptItem(e) {
    this.actOnItem(e.currentTarget.dataset.id, 'accepted');
  },

  onRejectItem(e) {
    this.actOnItem(e.currentTarget.dataset.id, 'rejected');
  },

  /** 打开「写反馈修改」编辑区 */
  onEditItem(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.discardItems.find((i) => i.id === id);
    this.setData({ editingItemId: id, editingNote: item ? item.user_note : '' });
  },

  onCancelEdit() {
    this.setData({ editingItemId: 0, editingNote: '' });
  },

  onNoteInput(e) {
    this.setData({ editingNote: e.detail.value || '' });
  },

  onSaveModified(e) {
    this.actOnItem(e.currentTarget.dataset.id, 'modified', this.data.editingNote);
  },

  /* ============ 重生成（R41 异步任务） ============ */

  async applyRegenResult(task) {
    if (task.status === 'done') {
      if (task.plan) {
        await this.load();
      }
      request
        .get('/points/balance')
        .then((bal) => {
          getApp().globalData.balance = bal.balance;
        })
        .catch(() => undefined);
      wx.showToast({ title: '新的一版方案出来啦', icon: 'none' });
    } else {
      wx.showToast({
        title: task.error || '重新生成失败了，别担心，点按钮再试一次就好',
        icon: 'none',
        duration: 2500,
      });
    }
  },

  async onRegenerate() {
    if (!this.data.plan || this.data.regenerating) return;
    this.setData({ regenerating: true });
    try {
      const data = await request.post(`/plans/${this.data.plan.id}/regenerate`);
      if (data && typeof data.balance === 'number') {
        getApp().globalData.balance = data.balance;
      }
      const task = await pollRegenTask(data.task_id);
      await this.applyRegenResult(task);
    } catch (e) {
      request.toastError(e, '重新生成失败，请稍后再试');
    } finally {
      this.setData({ regenerating: false });
    }
  },

  /* ============ 定格 → 执行清单 ============ */

  async onFinalize() {
    if (!this.data.plan || this.data.busy) return;
    this.setData({ busy: true });
    try {
      await request.post(`/plans/${this.data.plan.id}/finalize`);
      wx.showToast({ title: '方案已定格，照着做就行，一步一步来', icon: 'none', duration: 2000 });
      wx.redirectTo({ url: `/pages/todo/todo?sessionId=${this.data.sessionId}` });
    } catch (e) {
      request.toastError(e, '操作失败');
    } finally {
      this.setData({ busy: false });
    }
  },

  /* ============ 找人帮我整理（筹备中） ============ */

  onShowComingSoon() {
    this.setData({ showComingSoon: true });
  },

  onCloseComingSoon() {
    this.setData({ showComingSoon: false });
  },

  noop() {},
});
