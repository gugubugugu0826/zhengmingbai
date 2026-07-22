/**
 * svg-captcha 无官方类型声明，按需补充本项目用到的 API 面。
 * 库为纯 JS 实现（无原生依赖），create() 返回 { text, data(SVG字符串) }。
 */
declare module 'svg-captcha' {
  export interface ConfigObject {
    /** 验证码字符数，默认 4 */
    size?: number;
    /** 排除的字符集 */
    ignoreChars?: string;
    /** 干扰线数量，默认 1 */
    noise?: number;
    /** 字符是否随机着色，默认 false */
    color?: boolean;
    /** SVG 背景色 */
    background?: string;
    width?: number;
    height?: number;
    fontSize?: number;
    charPreset?: string;
  }

  export interface CaptchaObj {
    /** 验证码答案文本（仅服务端可见） */
    text: string;
    /** SVG 字符串 */
    data: string;
  }

  export function create(options?: ConfigObject): CaptchaObj;
  export function createMathExpr(options?: ConfigObject): CaptchaObj;
  export function randomText(size?: number): string;
}
