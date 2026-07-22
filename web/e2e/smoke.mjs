/**
 * API 级冒烟（R53）：node 原生 fetch，不依赖浏览器/playwright。
 * 链路：登录 → 建空间 → 上传 1 张 64x64 PNG → mock 分析 → 断言 plan 五部分齐全。
 * 前置：server 已启动（默认 http://localhost:3001，AI_MOCK=true）。
 * 用法：npm run smoke（web 包内）
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';

// 64x64 纯暖色 PNG（合法魔数 + 足够像素让校验器通过）
const PNG_B64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAA' +
  'hElEQVR4nO3RMQ0AIRDAsKD/qdyzBxQ0LH4x5wYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMDPAKgxAhXrCR8sAAAAAElFTkSuQmCC';

let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const run = async () => {
  console.log('== 1. 登录（mock 验证码） ==');
  const phone = `139${String(Date.now()).slice(-8)}`; // 每次跑独立用户，避免限发/数据干扰
  const login = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { phone, code: '1234' },
  });
  check('登录成功', login.json?.code === 0 && !!login.json?.data?.token,
    JSON.stringify(login.json).slice(0, 200));
  const token = login.json.data.token;

  console.log('== 2. 建空间 ==');
  const space = await api('/api/v1/spaces', {
    method: 'POST',
    token,
    body: { name: '冒烟客厅', space_type: 'living' },
  });
  check('建空间成功', space.json?.code === 0, JSON.stringify(space.json).slice(0, 200));
  const spaceId = space.json.data.id;

  console.log('== 3. 建会话 + 上传 1 张图 ==');
  const session = await api('/api/v1/sessions', {
    method: 'POST',
    token,
    body: { space_id: spaceId, granularity: 'region', discard_mode: 'conservative' },
  });
  check('建会话成功', session.json?.code === 0, JSON.stringify(session.json).slice(0, 200));
  const sessionId = session.json.data.id;
  const upload = await api(`/api/v1/sessions/${sessionId}/photos`, {
    method: 'POST',
    token,
    body: { photos: [PNG_B64] },
  });
  check('上传成功', upload.json?.code === 0 && upload.json.data.length === 1,
    JSON.stringify(upload.json).slice(0, 200));

  console.log('== 4. mock 分析出方案 ==');
  const analyze = await api(`/api/v1/sessions/${sessionId}/analyze`, { method: 'POST', token });
  check('分析成功', analyze.json?.code === 0, JSON.stringify(analyze.json).slice(0, 300));
  const content = analyze.json?.data?.content ?? {};
  check(
    '方案五部分齐全',
    ['discard_suggestions', 'groups', 'storage_advice', 'purchase_advice', 'steps'].every((k) =>
      Array.isArray(content[k]),
    ),
    Object.keys(content).join(','),
  );

  console.log(`\n结果：${passed} 通过, ${failed} 失败`);
  process.exit(failed > 0 ? 1 : 0);
};

run().catch((err) => {
  console.error('冒烟执行异常：', err);
  process.exit(1);
});
