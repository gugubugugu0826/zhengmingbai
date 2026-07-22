/**
 * AI Mock 数据（ai.mock=true 时使用）。
 * 精心编写，覆盖方案五部分：丢弃建议 / 分类归组 / 收纳位置+添置建议 / 编号步骤 / 示意插画 URL。
 * 文案语气遵循 PRD 4.1：温暖、说人话、不说教。
 */
import type { PlanContent } from './orchestrator.types.js';

export const SPACE_TYPE_LABELS: Record<string, string> = {
  bedroom: '卧室',
  kitchen: '厨房',
  wardrobe: '衣柜',
  study: '书房',
  bathroom: '卫生间',
  living: '客厅',
  rental: '出租屋',
  office: '办公室',
  shop: '店铺',
  warehouse: '仓库',
  other: '这个空间',
};

/** 确认环节 Mock：空间分组猜测 + 模糊物品提问 */
export function mockConfirmResult(photoIds: number[], spaceLabel: string): {
  groups: Array<{ tag: string; label: string; photo_ids: number[] }>;
  vague_items: Array<{ id: string; photo_id: number; question: string; hint: string }>;
} {
  const half = Math.ceil(photoIds.length / 2);
  const groups =
    photoIds.length > 3
      ? [
          { tag: 'g1', label: `${spaceLabel} · 靠窗一侧`, photo_ids: photoIds.slice(0, half) },
          { tag: 'g2', label: `${spaceLabel} · 靠门一侧`, photo_ids: photoIds.slice(half) },
        ]
      : [{ tag: 'g1', label: spaceLabel, photo_ids: photoIds }];
  const vague = photoIds.length
    ? [
        {
          id: 'v1',
          photo_id: photoIds[0],
          question: '角落那团鼓鼓的东西我没认出来，它是什么呀？',
          hint: '比如：换季被子 / 旧玩偶 / 一袋数据线……不确定可以跳过',
        },
      ]
    : [];
  return { groups, vague_items: vague };
}

const DISCARD_CONSERVATIVE = [
  { item: '明显过期的物品（食品、药品、化妆品）', reason: '过期的东西留着既占地方又不安全，建议优先处理。不过最终还是你说了算～', tone: 'gentle' },
  { item: '已经损坏、修不好的小物件', reason: '它们已经完成了自己的使命，放手也是一种感谢。', tone: 'gentle' },
];
const DISCARD_DECLUTTER_EXTRA = [
  { item: '一年都没碰过的东西', reason: '一年都没用上，大概率以后也用不上。可以拍照留念后放手，你说了算。', tone: 'gentle' },
  { item: '重复功能的东西（比如三根一样的数据线）', reason: '留下最好用的 1-2 个就够了，多余的可以转赠或回收。', tone: 'gentle' },
];

/** 各空间类型的 Mock 方案模板 */
const PLAN_TEMPLATES: Record<string, Omit<PlanContent, 'scene_summary' | 'after_state_desc'>> = {
  kitchen: {
    discard_suggestions: [
      { item: '过期调味品和开封太久的干货', reason: '调味品的赏味期比想象中短，过期的就让它毕业吧。不过你说了算～', tone: 'gentle' },
      { item: '缺口的碗碟和涂层脱落的不粘锅', reason: '有安全隐患，换掉它们做饭心情也会变好。', tone: 'gentle' },
    ],
    groups: [
      { name: '冷藏冷冻区', items: ['生鲜食材', '速冻食品', '酱料瓶'], kb_category: '冷藏冷冻区' },
      { name: '常温储物区', items: ['米面粮油', '干货', '零食'], kb_category: '常温储物区' },
      { name: '台面即时区', items: ['常用调料', '砧板刀具', '洗洁精'], kb_category: '台面即时区' },
      { name: '厨具器具', items: ['锅具', '餐具', '小家电'], kb_category: '厨具器具' },
      { name: '餐厨消耗品', items: ['保鲜膜', '垃圾袋', '厨房纸'], kb_category: '餐厨消耗品' },
    ],
    storage_advice: [
      { group: '台面即时区', location: '灶台右手边 30cm 内', tip: '最常用的调料只留 5 瓶以内，其余的收进柜子，台面立刻清爽' },
      { group: '厨具器具', location: '灶台下方抽屉 + 挂杆', tip: '锅具竖放比叠放好拿十倍，挂杆利用墙面空间' },
      { group: '餐厨消耗品', location: '水槽下方柜门内侧', tip: '用免钉挂篮装垃圾袋和保鲜膜，关上门什么都看不见' },
    ],
    purchase_advice: [
      { category: '抽屉分隔盒', reason: '让餐具和小工具各自归位，拉开抽屉不再翻箱倒柜', product_link: null },
      { category: '可叠放密封罐', reason: '干货杂粮统一装罐，防潮又一目了然', product_link: null },
      { category: '水槽下置物架', reason: '避开下水管的分层架，把鸡肋空间用起来', product_link: null },
    ],
    steps: [
      { no: 1, action: '清空台面，把过期品全部请出来', target_groups: ['台面即时区', '餐厨消耗品'], est_minutes: 10 },
      { no: 2, action: '处理丢弃清单：过期调味品、破损餐具', target_groups: ['常温储物区'], est_minutes: 10 },
      { no: 3, action: '按五个分区把物品归组摆放', target_groups: ['冷藏冷冻区', '常温储物区', '厨具器具'], est_minutes: 20 },
      { no: 4, action: '常用调料放回灶台边，其余入柜', target_groups: ['台面即时区'], est_minutes: 10 },
      { no: 5, action: '垃圾袋、保鲜膜收进水槽下挂篮，收尾擦一遍台面', target_groups: ['餐厨消耗品'], est_minutes: 10 },
    ],
  },
  bedroom: {
    discard_suggestions: [
      { item: '起球变形的旧 T 恤和单只袜子', reason: '穿着不舒服的衣服留着只是占地方，可以考虑捐掉。你说了算～', tone: 'gentle' },
      { item: '床头积灰的充电线和坏掉的小玩意儿', reason: '坏了就放手吧，床头清爽了睡眠也会变好。', tone: 'gentle' },
    ],
    groups: [
      { name: '应季衣物', items: ['当季常穿', '居家服'], kb_category: '衣物区' },
      { name: '换季衣物', items: ['过季外套', '厚被子'], kb_category: '衣物区' },
      { name: '床品区', items: ['四件套', '枕芯'], kb_category: '床品区' },
      { name: '床头小物', items: ['书', '充电线', '眼罩'], kb_category: '杂物区' },
    ],
    storage_advice: [
      { group: '应季衣物', location: '衣柜黄金区（抬手就能够到的位置）', tip: '常穿的挂起来，按颜色排，早上找衣服节省 5 分钟' },
      { group: '换季衣物', location: '衣柜顶层 + 床底收纳箱', tip: '真空压缩袋抽掉空气，体积立刻小一半' },
      { group: '床头小物', location: '床头抽屉一格一物', tip: '台面只留台灯和水杯，睡前视线干净更容易入睡' },
    ],
    purchase_advice: [
      { category: '床底收纳箱', reason: '换季衣物和被子的好归宿，防尘又好拉取', product_link: null },
      { category: '真空压缩袋', reason: '厚被子羽绒服压缩后省出大半个衣柜', product_link: null },
    ],
    steps: [
      { no: 1, action: '把床上、椅子上的衣物全部堆到一处', target_groups: ['应季衣物', '换季衣物'], est_minutes: 5 },
      { no: 2, action: '分拣：常穿 / 换季 / 可放手 三堆', target_groups: ['应季衣物'], est_minutes: 15 },
      { no: 3, action: '常穿的挂进衣柜黄金区，换季压缩收顶层', target_groups: ['应季衣物', '换季衣物'], est_minutes: 20 },
      { no: 4, action: '床头只留台灯和水杯，小物入抽屉', target_groups: ['床头小物'], est_minutes: 10 },
    ],
  },
  wardrobe: {
    discard_suggestions: [
      { item: '两年没穿过的衣服', reason: '它们占着最黄金的位置却从不上场，可以捐给更需要的人。你说了算～', tone: 'gentle' },
      { item: '变形衣架和破损收纳盒', reason: '工具不好用，整理就事倍功半，换掉它们。', tone: 'gentle' },
    ],
    groups: [
      { name: '悬挂区', items: ['外套', '衬衫', '连衣裙'], kb_category: '衣物区' },
      { name: '叠放区', items: ['T 恤', '毛衣', '卫衣'], kb_category: '衣物区' },
      { name: '小件区', items: ['内衣', '袜子', '配饰'], kb_category: '小件区' },
      { name: '换季区', items: ['过季衣物', '被褥'], kb_category: '换季区' },
    ],
    storage_advice: [
      { group: '悬挂区', location: '衣柜中段黄金区', tip: '统一换成薄款防滑衣架，容量立刻多出三分之一' },
      { group: '小件区', location: '抽屉 + 分隔格', tip: '袜子卷起来竖放，一眼看到每一双' },
      { group: '换季区', location: '顶层 + 底层', tip: '贴个标签写明内容，换季时不用全翻出来' },
    ],
    purchase_advice: [
      { category: '薄款防滑衣架', reason: '统一衣架是衣柜显整齐的最快方式', product_link: null },
      { category: '抽屉分隔格', reason: '内衣袜子分格放，再也不用翻', product_link: null },
    ],
    steps: [
      { no: 1, action: '把衣柜清空，全部摊在床上', target_groups: ['悬挂区', '叠放区'], est_minutes: 10 },
      { no: 2, action: '按四个分区分堆，顺手挑出可放手的', target_groups: ['悬挂区'], est_minutes: 20 },
      { no: 3, action: '挂的回挂、叠的竖放进抽屉', target_groups: ['悬挂区', '叠放区', '小件区'], est_minutes: 20 },
      { no: 4, action: '换季衣物打包进顶层，贴标签', target_groups: ['换季区'], est_minutes: 10 },
    ],
  },
};

/** 通用模板（未定制的空间类型使用） */
const GENERIC_TEMPLATE: Omit<PlanContent, 'scene_summary' | 'after_state_desc'> = {
  discard_suggestions: DISCARD_CONSERVATIVE,
  groups: [
    { name: '高频使用', items: ['每天/每周都会用的东西'], kb_category: '高频区' },
    { name: '低频使用', items: ['偶尔用但确实需要的'], kb_category: '低频区' },
    { name: '纪念收藏', items: ['有感情不舍得扔的'], kb_category: '收藏区' },
    { name: '待处理', items: ['可放手 / 待转赠 / 待回收'], kb_category: '待处理区' },
  ],
  storage_advice: [
    { group: '高频使用', location: '视线平齐的黄金区', tip: '最常用的东西放最顺手的位置，用完立刻归位' },
    { group: '低频使用', location: '高处或深处的柜子', tip: '装进统一收纳盒并贴标签，找的时候不抓狂' },
    { group: '纪念收藏', location: '一个固定的"回忆盒"', tip: '给纪念品划定容量上限，装满了就要做取舍' },
  ],
  purchase_advice: [
    { category: '统一规格收纳盒', reason: '视觉上立刻整齐，堆叠也稳', product_link: null },
    { category: '标签贴纸', reason: '写上内容物，三个月后也不会忘记里面是什么', product_link: null },
  ],
  steps: [
    { no: 1, action: '清空一个平面（桌面/床面）作为分拣台', target_groups: ['高频使用'], est_minutes: 5 },
    { no: 2, action: '把物品按四个分区归堆，挑出待处理的', target_groups: ['待处理'], est_minutes: 15 },
    { no: 3, action: '高频物品放回黄金区，低频入盒贴标签', target_groups: ['高频使用', '低频使用'], est_minutes: 20 },
    { no: 4, action: '待处理物品装袋放门口，一周内送出去', target_groups: ['待处理'], est_minutes: 5 },
  ],
};

/** 生成 Mock 方案内容（五部分齐全，按空间类型 + 用户偏好定制） */
export function mockPlanContent(options: {
  spaceType: string;
  spaceName: string;
  discardMode: string;
  granularity: string;
  vagueAnswers: string[];
  regenVersion: number;
  rejectedNotes: string[];
}): PlanContent {
  const template =
    PLAN_TEMPLATES[options.spaceType] ?? { ...GENERIC_TEMPLATE };
  const label = SPACE_TYPE_LABELS[options.spaceType] ?? '这个空间';
  const granularityText = options.granularity === 'item' ? '物品级' : '区域级';

  // 深拷贝模板，避免跨请求污染
  const content: PlanContent = JSON.parse(JSON.stringify(template));

  if (options.discardMode === 'declutter') {
    content.discard_suggestions = [
      ...content.discard_suggestions,
      ...JSON.parse(JSON.stringify(DISCARD_DECLUTTER_EXTRA)),
    ];
  }

  // 模糊物品回答融入场景描述
  const vagueText =
    options.vagueAnswers.length > 0 ? `（你提到的「${options.vagueAnswers.join('、')}」我也考虑进去了）` : '';
  const regenText =
    options.regenVersion > 1 ? `这是第 ${options.regenVersion} 版方案，已参考你上次的调整。` : '';
  const rejectText =
    options.rejectedNotes.length > 0
      ? `你上次觉得「${options.rejectedNotes.slice(0, 2).join('、')}」不太合适，这版我做了调整。`
      : '';

  content.scene_summary = `一间东西不少但都有救的${label}，按${granularityText}看了一遍：主要是物品没有固定位置、高频低频混在一起。${vagueText}`;
  content.after_state_desc = `整理后：每类东西都有自己的"家"，常用的抬手就够到，台面只留两三件心头好。${regenText}${rejectText}别担心，照着做就行，一步一步来。`;

  return content;
}
