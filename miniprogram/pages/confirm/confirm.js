/**
 * AI 确认页（v3，对齐 Web Confirm 页）：三步卡片推进。
 * 新流程（sessionId='new'）：0=偏好三件套 → 建会话+传照片+confirm/run → 1=分组 2=问答 → confirm → analyze
 * 已有会话：confirm/run → 0=分组 1=问答 2=偏好 → confirm → analyze
 * 偏好三件套完整：丢弃模式 + 分析粒度 + 输出形式（C 必须搭配 A 或 B，D10）。
 */
const request = require('../../utils/request');
const { ensureLogin, fileToBase64 } = require('../../utils/auth');
const {
  SPACE_TYPE_LABELS,
  DISCARD_MODES,
  GRANULARITIES,
  OUTPUT_FORMS,
} = require('../../utils/constants');

Page({
  data: {
    isNew: false,
    sessionId: '',
    step: 0,
    stepsTotal: 3,
    loading: false,
    busy: false,
    busyText: '',
    session: null,
    /** 服务器照片 {id, url} */
    photos: [],
    confirmResult: null,
    /** 分组视图（photo_ids 已映射为带 url 的对象，WXML 不支持 find 表达式） */
    groupsView: [],
    /** 模糊物品视图（photoUrl 已映射） */
    vagueView: [],
    answers: {},
    // 偏好三件套
    discardModes: DISCARD_MODES,
    granularities: GRANULARITIES,
    outputFormOptions: OUTPUT_FORMS,
    prefs: {
      discardMode: 'conservative',
      granularity: 'region',
      outputForms: ['checklist'],
    },
    outputValid: true,
    balance: 0,
    spaceTypeLabel: '',
  },

  onLoad(options) {
    if (!ensureLogin()) return;
    const sessionId = (options && options.sessionId) || '';
    const isNew = sessionId === 'new';
    this.setData({
      isNew,
      sessionId,
      balance: getApp().globalData.balance || 0,
    });

    if (isNew) {
      // 校验拍照页草稿
      const draft = getApp().captureDraft;
      if (!draft || !draft.photoPaths || draft.photoPaths.length === 0) {
        wx.showToast({ title: '先拍几张照片再来哦', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 800);
        return;
      }
      this.setData({
        spaceTypeLabel: SPACE_TYPE_LABELS[draft.spaceType] || '空间',
        step: 0,
      });
      return;
    }

    // 已有会话：拉详情（已出方案则直接跳方案页）
    this.setData({ loading: true });
    request
      .get(`/sessions/${sessionId}`)
      .then((detail) => {
        if (detail.plan) {
          wx.redirectTo({ url: `/pages/plan/plan?sessionId=${detail.id}` });
          return;
        }
        this.setData({ session: detail, photos: detail.photos || [], loading: false });
        this.runConfirm();
      })
      .catch((e) => {
        this.setData({ loading: false });
        request.toastError(e, '会话加载失败');
        setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 800);
      });
  },

  /* ============ 偏好三件套 ============ */

  onPickDiscard(e) {
    this.setData({ 'prefs.discardMode': e.currentTarget.dataset.key });
  },

  onPickGranularity(e) {
    this.setData({ 'prefs.granularity': e.currentTarget.dataset.key });
  },

  onToggleOutputForm(e) {
    const key = e.currentTarget.dataset.key;
    const forms = this.data.prefs.outputForms.slice();
    const idx = forms.indexOf(key);
    if (idx >= 0) {
      forms.splice(idx, 1);
    } else {
      forms.push(key);
    }
    this.setData({ 'prefs.outputForms': forms });
    this.checkOutputValid();
  },

  checkOutputValid() {
    const forms = this.data.prefs.outputForms;
    const valid = forms.length > 0 && !(forms.indexOf('annotation') >= 0 && forms.length === 1);
    this.setData({ outputValid: valid });
    return valid;
  },

  /* ============ 新流程：建会话 + 传照片 + confirm/run ============ */

  async createSessionAndRun() {
    if (!this.checkOutputValid()) {
      wx.showToast({ title: '选 C 的话，记得再搭配 A 或 B 哦', icon: 'none' });
      return;
    }
    const draft = getApp().captureDraft;
    if (!draft) return;
    const { prefs } = this.data;

    this.setData({ busy: true, busyText: '正在上传照片…' });
    try {
      const label = SPACE_TYPE_LABELS[draft.spaceType] || '空间';
      const spaces = await request.get('/spaces');
      let space = (Array.isArray(spaces) ? spaces : []).find((s) => s.space_type === draft.spaceType);
      if (!space) {
        space = await request.post('/spaces', { name: `我的${label}`, space_type: draft.spaceType });
      }
      const created = await request.post('/sessions', {
        space_id: space.id,
        granularity: prefs.granularity,
        discard_mode: prefs.discardMode,
        output_forms: prefs.outputForms,
        ...(draft.keepPhotos !== undefined ? { keep_photos: draft.keepPhotos } : {}),
      });

      // 本地照片转 base64 上传
      this.setData({ busyText: '正在上传照片（转码中）…' });
      const base64Photos = [];
      for (const path of draft.photoPaths) {
        // eslint-disable-next-line no-await-in-loop
        base64Photos.push(await fileToBase64(path));
      }
      this.setData({ busyText: '正在上传照片…' });
      const uploaded = await request.post(`/sessions/${created.id}/photos`, { photos: base64Photos });

      const detail = await request.get(`/sessions/${created.id}`);
      this.setData({
        session: detail,
        photos: Array.isArray(uploaded) ? uploaded : detail.photos || [],
        sessionId: String(created.id),
      });
      getApp().captureDraft = null;

      this.setData({ busyText: 'AI 正在看照片…' });
      const result = await request.post(`/sessions/${created.id}/confirm/run`);
      this.setData({ confirmResult: result, step: 1 });
      this.buildViews(result);
    } catch (e) {
      request.toastError(e, '上传失败，请稍后再试');
    } finally {
      this.setData({ busy: false, busyText: '' });
    }
  },

  /* ============ 已有会话：confirm/run ============ */

  async runConfirm() {
    if (!this.data.session) return;
    this.setData({ busy: true, busyText: 'AI 正在看照片…' });
    try {
      const result = await request.post(`/sessions/${this.data.session.id}/confirm/run`);
      this.setData({ confirmResult: result, step: this.data.isNew ? 1 : 0 });
      this.buildViews(result);
    } catch (e) {
      request.toastError(e, 'AI 确认失败，请稍后再试');
    } finally {
      this.setData({ busy: false, busyText: '' });
    }
  },

  /* ============ 分组 / 问答 ============ */

  /** 把 confirmResult 映射为 WXML 可直接渲染的视图结构 */
  buildViews(result) {
    const photos = this.data.photos;
    const urlOf = (pid) => {
      const found = photos.find((p) => p.id === pid);
      return found ? found.url : '';
    };
    const groupsView = (result.groups || []).map((g) => ({
      tag: g.tag,
      label: g.label,
      photos: (g.photo_ids || []).map((pid) => ({ id: pid, url: urlOf(pid) })),
    }));
    const vagueView = (result.vague_items || []).map((v) => ({
      id: v.id,
      photo_id: v.photo_id,
      photoUrl: urlOf(v.photo_id),
      question: v.question,
      hint: v.hint,
    }));
    this.setData({ groupsView, vagueView });
  },

  onAnswerInput(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ [`answers.${id}`]: e.detail.value || '' });
  },

  onSkipAnswer(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ [`answers.${id}`]: '' });
  },

  onNextStep() {
    this.setData({ step: this.data.step + 1 });
  },

  /* ============ 最终提交：confirm → analyze → 方案页 ============ */

  async submitAll() {
    if (!this.data.session) return;
    if (!this.checkOutputValid()) {
      wx.showToast({ title: '选 C 的话，记得再搭配 A 或 B 哦', icon: 'none' });
      return;
    }
    const sessionId = this.data.session.id;
    const { confirmResult, answers } = this.data;

    this.setData({ busy: true, busyText: 'AI 正在出方案…' });
    try {
      await request.post(`/sessions/${sessionId}/confirm`, {
        groups: confirmResult
          ? confirmResult.groups.map((g) => ({ tag: g.tag, photo_ids: g.photo_ids }))
          : [],
        vague_answers: Object.keys(answers)
          .filter((k) => (answers[k] || '').trim())
          .map((k) => `${k}: ${answers[k].trim()}`),
      });
      const plan = await request.post(`/sessions/${sessionId}/analyze`);
      if (plan && typeof plan.balance === 'number') {
        getApp().globalData.balance = plan.balance;
      }
      wx.showToast({ title: '方案出来啦，看看合不合心意', icon: 'none', duration: 2000 });
      wx.redirectTo({ url: `/pages/plan/plan?sessionId=${sessionId}` });
    } catch (e) {
      // 3001 在 request 层是维护模式；这里点数不足后端复用其他错误码，按 message 提示
      request.toastError(e, '分析失败，请稍后再试');
    } finally {
      this.setData({ busy: false, busyText: '' });
    }
  },
});
