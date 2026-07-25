/**
 * 执行清单页（v3，对齐 Web TodoList 页）：
 * 步骤勾选（进度云端保存）、顶部进度条、重进恢复、全部完成提示 + 会话完成回写。
 * 收尾项「拍张整理后的照片，存到我的家」：清单末尾常驻引导卡，支持拍照/相册上传
 * （POST /sessions/:id/after-photos，base64 数组，≤9 张），上传后存档到空间档案，
 * 前后对比在空间详情页并排展示。
 */
const request = require('../../utils/request');
const { ensureLogin, filesToBase64 } = require('../../utils/auth');
const { MAX_AFTER_PHOTOS } = require('../../utils/constants');

Page({
  data: {
    sessionId: '',
    session: null,
    plan: null,
    steps: [],
    progress: { total: 0, checked: 0 },
    percent: 0,
    completed: false,
    allDone: false,
    // 收尾拍照
    maxAfterPhotos: MAX_AFTER_PHOTOS,
    pickedPaths: [],
    uploadedUrls: [],
    uploading: false,
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    this.setData({ sessionId: (options && options.sessionId) || '' });
    this.load();
  },

  async load() {
    try {
      const detail = await request.get(`/sessions/${this.data.sessionId}`);
      if (!detail.plan) {
        wx.redirectTo({ url: `/pages/confirm/confirm?sessionId=${this.data.sessionId}` });
        return;
      }
      const steps = (detail.plan.items || [])
        .filter((i) => i.item_type === 'step' && i.status !== 'rejected')
        .sort((a, b) => a.sort - b.sort)
        .map((i) => ({
          id: i.id,
          checked: i.checked === 1,
          no: (i.content && i.content.no) || 0,
          action: (i.content && i.content.action) || '',
          est_minutes: (i.content && i.content.est_minutes) || 10,
        }));
      this.setData({
        session: detail,
        plan: detail.plan,
        steps,
        progress: detail.plan.todo_progress || { total: steps.length, checked: 0 },
        completed: detail.status === 'done',
      });
      this.refreshDerived();
    } catch (e) {
      request.toastError(e, '清单加载失败');
      setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 800);
    }
  },

  /** 派生数据：百分比 / 是否全勾 */
  refreshDerived() {
    const { progress } = this.data;
    const percent = progress.total === 0 ? 0 : Math.round((progress.checked / progress.total) * 100);
    this.setData({
      percent,
      allDone: progress.total > 0 && progress.checked >= progress.total,
    });
  },

  /* ============ 步骤勾选 ============ */

  async onToggleStep(e) {
    const id = e.currentTarget.dataset.id;
    const steps = this.data.steps.slice();
    const target = steps.find((s) => s.id === id);
    if (!target) return;
    const nextChecked = !target.checked;

    // 乐观更新
    target.checked = nextChecked;
    const progress = {
      total: this.data.progress.total,
      checked: this.data.progress.checked + (nextChecked ? 1 : -1),
    };
    this.setData({ steps, progress });
    this.refreshDerived();

    try {
      const result = await request.patch(`/plans/items/${id}/check`, { checked: nextChecked });
      this.setData({ progress: result });
      this.refreshDerived();
      if (nextChecked) {
        wx.showToast({ title: '又搞定一步，继续保持～', icon: 'none' });
      }
    } catch (e2) {
      request.toastError(e2, '保存失败，请稍后再试');
      await this.load(); // 失败回滚：重新拉取
    }
  },

  /* ============ 收尾项：拍张整理后的照片，存到我的家 ============ */

  pickAfterPhotos(sourceType) {
    const remain = MAX_AFTER_PHOTOS - this.data.pickedPaths.length - this.data.uploadedUrls.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多存 ${MAX_AFTER_PHOTOS} 张哦`, icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: Math.min(remain, 9),
      mediaType: ['image'],
      sourceType: [sourceType],
      sizeType: ['compressed'],
      success: (res) => {
        const files = (res.tempFiles || []).slice(0, remain);
        this.setData({
          pickedPaths: this.data.pickedPaths.concat(files.map((f) => f.tempFilePath)),
        });
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') < 0) {
          wx.showToast({ title: '选图失败，再试一次', icon: 'none' });
        }
      },
    });
  },

  onAfterCamera() {
    this.pickAfterPhotos('camera');
  },

  onAfterAlbum() {
    this.pickAfterPhotos('album');
  },

  onRemovePicked(e) {
    const index = e.currentTarget.dataset.index;
    const pickedPaths = this.data.pickedPaths.slice();
    pickedPaths.splice(index, 1);
    this.setData({ pickedPaths });
  },

  /** 上传 after-photos（base64 数组，≤9 张） */
  async onUploadAfter() {
    if (this.data.pickedPaths.length === 0 || this.data.uploading) return;
    this.setData({ uploading: true });
    try {
      const base64Photos = await filesToBase64(
        this.data.pickedPaths.map((p) => ({ tempFilePath: p })),
      );
      const result = await request.post(`/sessions/${this.data.sessionId}/after-photos`, {
        photos: base64Photos,
      });
      const urls = ((result && result.photos) || []).map((p) => p.url);
      this.setData({
        uploadedUrls: this.data.uploadedUrls.concat(urls),
        pickedPaths: [],
      });
      wx.showToast({ title: '整理后的照片已存到我的家', icon: 'none', duration: 2500 });
    } catch (e) {
      request.toastError(e, '上传失败，请稍后再试');
    } finally {
      this.setData({ uploading: false });
    }
  },

  /* ============ 完成会话 ============ */

  async onFinishSession() {
    if (!this.data.session) return;
    try {
      await request.post(`/sessions/${this.data.sessionId}/complete`);
      this.setData({ completed: true });
      wx.showToast({ title: '太棒了！这个空间整明白了', icon: 'none', duration: 2000 });
    } catch (e) {
      request.toastError(e, '操作失败');
    }
  },

  goSpaceDetail() {
    if (!this.data.session) return;
    wx.redirectTo({
      url: `/pages/space-detail/space-detail?id=${this.data.session.space_id}`,
    });
  },

  goBackPlan() {
    wx.redirectTo({ url: `/pages/plan/plan?sessionId=${this.data.sessionId}` });
  },
});
