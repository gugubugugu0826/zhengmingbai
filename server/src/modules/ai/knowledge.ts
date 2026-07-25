/**
 * 知识库（R16）：中式生活物品分类知识库，AI 分析时注入为先验。
 * 10 类空间初版种子；后台可增删改、即时生效。
 */
import { db } from '../../db.js';

export interface KnowledgeRow {
  id: number;
  space_type: string;
  category: string;
  items_json: string;
  sort: number;
  is_active: number;
}

/** 各空间分类体系（厨房版为 owner 提供的五区结构，其余按同结构补齐） */
const KB_SEED: Array<{ space_type: string; category: string; items: string[]; sort: number }> = [
  // 厨房（owner 提供）
  { space_type: 'kitchen', category: '冷藏冷冻区', items: ['生鲜', '速冻', '酱料', '剩菜密封盒'], sort: 1 },
  { space_type: 'kitchen', category: '常温储物区', items: ['米面粮油', '干货', '零食', '饮用水'], sort: 2 },
  { space_type: 'kitchen', category: '台面即时区', items: ['常用调料', '刀具砧板', '洗洁精', '抹布'], sort: 3 },
  { space_type: 'kitchen', category: '厨具器具', items: ['锅具', '餐具', '小家电', '烘焙工具'], sort: 4 },
  { space_type: 'kitchen', category: '餐厨消耗品', items: ['保鲜膜', '垃圾袋', '厨房纸', '洗洁精补充装'], sort: 5 },
  // 衣柜
  { space_type: 'wardrobe', category: '悬挂区', items: ['外套', '衬衫', '连衣裙', '西装'], sort: 1 },
  { space_type: 'wardrobe', category: '叠放区', items: ['T恤', '毛衣', '卫衣', '牛仔裤'], sort: 2 },
  { space_type: 'wardrobe', category: '小件区', items: ['内衣', '袜子', '围巾', '腰带'], sort: 3 },
  { space_type: 'wardrobe', category: '换季区', items: ['羽绒服', '厚被子', '过季衣物'], sort: 4 },
  // 卧室
  { space_type: 'bedroom', category: '衣物区', items: ['应季衣物', '换季衣物', '居家服'], sort: 1 },
  { space_type: 'bedroom', category: '床品区', items: ['四件套', '枕芯', '毯子'], sort: 2 },
  { space_type: 'bedroom', category: '床头区', items: ['书', '充电线', '眼罩', '水杯'], sort: 3 },
  { space_type: 'bedroom', category: '杂物区', items: ['化妆品', '药箱', '纪念品'], sort: 4 },
  // 书房/办公室
  { space_type: 'study', category: '书籍区', items: ['常读书', '工具书', '收藏书'], sort: 1 },
  { space_type: 'study', category: '文具区', items: ['笔', '本子', '便签'], sort: 2 },
  { space_type: 'study', category: '数码区', items: ['数据线', '充电器', '耳机'], sort: 3 },
  { space_type: 'study', category: '文件区', items: ['证件', '合同', '票据'], sort: 4 },
  { space_type: 'office', category: '桌面区', items: ['电脑', '水杯', '便签'], sort: 1 },
  { space_type: 'office', category: '文件区', items: ['合同', '资料夹', '票据'], sort: 2 },
  { space_type: 'office', category: '数码区', items: ['数据线', '充电器', '拓展坞'], sort: 3 },
  // 卫生间
  { space_type: 'bathroom', category: '洗漱区', items: ['牙具', '洗面奶', '毛巾'], sort: 1 },
  { space_type: 'bathroom', category: '沐浴区', items: ['洗发水', '沐浴露', '浴球'], sort: 2 },
  { space_type: 'bathroom', category: '清洁区', items: ['洁厕剂', '刷子', '拖把'], sort: 3 },
  { space_type: 'bathroom', category: '囤货区', items: ['纸巾', '补充装'], sort: 4 },
  // 客厅/出租屋/店铺/仓库
  { space_type: 'living', category: '会客区', items: ['茶具', '零食', '遥控器'], sort: 1 },
  { space_type: 'living', category: '展示收纳区', items: ['摆件', '书籍', '绿植'], sort: 2 },
  { space_type: 'living', category: '杂物区', items: ['药箱', '工具', '囤货'], sort: 3 },
  { space_type: 'rental', category: '生活区', items: ['衣物', '床品', '洗漱'], sort: 1 },
  { space_type: 'rental', category: '餐厨区', items: ['简易厨具', '速食'], sort: 2 },
  { space_type: 'rental', category: '工作区', items: ['电脑', '书', '文具'], sort: 3 },
  { space_type: 'shop', category: '陈列区', items: ['商品', '价签', '装饰'], sort: 1 },
  { space_type: 'shop', category: '仓储区', items: ['库存', '包装', '耗材'], sort: 2 },
  { space_type: 'warehouse', category: '存储区', items: ['箱装货', '托盘'], sort: 1 },
  { space_type: 'warehouse', category: '分拣区', items: ['工具', '耗材', '标签'], sort: 2 },
  // 其他（自定义空间兜底，通用四区结构）
  { space_type: 'other', category: '常用区', items: ['高频使用物品', '随手取放物品'], sort: 1 },
  { space_type: 'other', category: '储物区', items: ['低频物品', '囤货', '备用物品'], sort: 2 },
  { space_type: 'other', category: '展示陈列区', items: ['装饰品', '收藏品', '常看的物品'], sort: 3 },
  { space_type: 'other', category: '待处理区', items: ['待归类', '待丢弃', '待转赠'], sort: 4 },
];

export function seedKnowledgeBase(): void {
  const stmt = db.prepare(
    `INSERT INTO knowledge_base (space_type, category, items_json, sort)
     SELECT ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM knowledge_base WHERE space_type = ? AND category = ?
     )`,
  );
  for (const row of KB_SEED) {
    stmt.run(
      row.space_type,
      row.category,
      JSON.stringify(row.items),
      row.sort,
      row.space_type,
      row.category,
    );
  }
}

/** 取某空间类型的知识库先验（AI 分析时拼进系统提示词） */
export function getKnowledgeFor(spaceType: string): Array<{ category: string; items: string[] }> {
  const rows = db
    .prepare(
      `SELECT category, items_json FROM knowledge_base
       WHERE space_type = ? AND is_active = 1 ORDER BY sort, id`,
    )
    .all(spaceType) as Array<{ category: string; items_json: string }>;
  return rows.map((r) => ({ category: r.category, items: JSON.parse(r.items_json) as string[] }));
}

export function listKnowledge(spaceType?: string): KnowledgeRow[] {
  if (spaceType) {
    return db
      .prepare('SELECT * FROM knowledge_base WHERE space_type = ? ORDER BY sort, id')
      .all(spaceType) as KnowledgeRow[];
  }
  return db.prepare('SELECT * FROM knowledge_base ORDER BY space_type, sort, id').all() as KnowledgeRow[];
}
