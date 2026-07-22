/**
 * 我的点数页（v3，对齐 Web Points 页 + 点数流水）：
 * 余额卡片 + 点数用途说明 + 点数流水（GET /points/transactions 分页）。
 * 不放充值入口——点数只能管理员发放，展示"联系管理员充点"说明（支付挂起）。
 */
const request = require('../../utils/request');
const { ensureLogin } = require('../../utils/auth');
const { formatDateTime } = require('../../utils/constants');

Page({
  data: {
    balance: 0,
    enough: false,
    transactions: [],
    page: 1,
    hasMore: false,
    loadingMore: false,
  },

  onLoad() {
    if (!ensureLogin()) return;
    this.loadBalance();
    this.loadTransactions(1);
  },

  loadBalance() {
    request
      .get('/points/balance')
      .then((d) => {
        this.setData({ balance: d.balance, enough: d.balance >= 10 });
        getApp().globalData.balance = d.balance;
      })
      .catch(() => undefined);
  },

  /** 点数流水：兼容 {list,total} 与纯数组两种响应形态 */
  loadTransactions(page) {
    this.setData({ loadingMore: true });
    request
      .get('/points/transactions', { page, pageSize: 20 })
      .then((d) => {
        let list = [];
        let total = 0;
        if (Array.isArray(d)) {
          list = d;
          total = d.length;
        } else if (d && Array.isArray(d.list)) {
          list = d.list;
          total = typeof d.total === 'number' ? d.total : d.list.length;
        }
        const mapped = list.map((t) => {
          const amount = typeof t.amount === 'number' ? t.amount : (t.points || 0);
          return {
            id: t.id,
            amount,
            amountText: `${amount >= 0 ? '+' : ''}${amount}`,
            positive: amount >= 0,
            reason: t.reason || t.title || t.type || '点数变动',
            timeText: formatDateTime(t.created_at),
          };
        });
        const transactions = page === 1 ? mapped : this.data.transactions.concat(mapped);
        this.setData({
          transactions,
          page,
          hasMore: transactions.length < total && list.length > 0,
          loadingMore: false,
        });
      })
      .catch(() => {
        this.setData({ loadingMore: false });
      });
  },

  onLoadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    this.loadTransactions(this.data.page + 1);
  },
});
