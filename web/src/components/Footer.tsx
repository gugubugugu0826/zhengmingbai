/**
 * 网站底部备案号组件。
 * 依据工信部 + 公安联网备案要求：所有可访问页面底部需悬挂
 * ICP 备案号（链接工信部官网）+ 公安备案号（链接全国互联网安全管理平台）。
 *
 * 更新方式：备案号变更时只改本文件顶部常量即可，全站统一生效。
 */
import type { JSX } from 'react';

/** ICP 备案号（工信部）：备案通过后获得，格式「省份简称+ICP备+序列号」 */
const ICP_BEIAN = '闽ICP备2026027631号';
const ICP_BEIAN_URL = 'https://beian.miit.gov.cn/';

/**
 * 公安备案号（全国互联网安全管理服务平台）：
 * 在 beian.gov.cn 完成公安联网备案后获得，格式「省份简称+公网安备+序列号」。
 * 尚未拿到时留空字符串，组件会自动隐藏该项；拿到后填入即可全站显示。
 */
const GONGAN_BEIAN = '';
const GONGAN_BEIAN_URL = 'https://www.beian.gov.cn/';

/** 主体备案号 vs 服务备案号：非广东省备案地统一挂服务备案号（域名级），此处即用 ICP_BEIAN */
export function SiteFooter(): JSX.Element {
  return (
    <footer className="w-full border-t border-border-subtle bg-cream py-4 text-center">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 text-[12px] text-warm-light">
        <a
          href={ICP_BEIAN_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="transition-colors hover:text-primary"
        >
          {ICP_BEIAN}
        </a>
        {GONGAN_BEIAN && (
          <a
            href={GONGAN_BEIAN_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="transition-colors hover:text-primary"
          >
            {GONGAN_BEIAN}
          </a>
        )}
      </div>
    </footer>
  );
}
