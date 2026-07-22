/**
 * v3 维护模式全屏页（HTTP 503 / code 3001 拦截渲染）：
 * 温暖口语化文案，公告内容取后端 data.notice；由 AppShell 订阅 maintenanceStore 渲染。
 */
interface MaintenancePageProps {
  /** 维护公告（后端 ops.maintenance.notice），空串时用默认文案 */
  notice?: string;
}

export function MaintenancePage({ notice = '' }: MaintenancePageProps): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-8 text-center">
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-xl bg-tint text-[48px] shadow-card">
        🧺
      </div>
      <h1 className="text-[22px] font-semibold text-warm">整明白正在休整中</h1>
      <p className="mt-3 max-w-md text-[15px] leading-7 text-warm-secondary">
        {notice || '系统维护中，请稍后再来'}
      </p>
      <p className="mt-6 text-[13px] text-warm-light">收拾好了就马上回来，不会太久～</p>
    </div>
  );
}
