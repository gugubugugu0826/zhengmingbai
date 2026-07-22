/**
 * 登录态工具（v3）
 *
 * - ensureLogin：需要登录的页面 onShow 调用，未登录跳登录页
 * - fileToBase64：wx.chooseMedia / wx.chooseImage 选图后转 base64 dataURL
 */

/**
 * 校验登录态；未登录则 reLaunch 到登录页。
 * @returns {boolean} 是否已登录
 */
function ensureLogin() {
  const app = getApp();
  const token = (app && app.globalData && app.globalData.token) || wx.getStorageSync('token');
  if (!token) {
    wx.reLaunch({ url: '/pages/login/login' });
    return false;
  }
  return true;
}

/**
 * 读取本地图片文件为 base64 dataURL（后端上传格式：data:image/jpeg;base64,...）。
 * @param {string} filePath 本地临时路径
 * @returns {Promise<string>} dataURL
 */
function fileToBase64(filePath) {
  return new Promise((resolve, reject) => {
    // 按扩展名推断 mime，默认 jpeg
    let mime = 'image/jpeg';
    const m = /\.(png|webp|heic|heif)$/i.exec(filePath);
    if (m) {
      const ext = m[1].toLowerCase();
      if (ext === 'png') mime = 'image/png';
      else if (ext === 'webp') mime = 'image/webp';
      else mime = 'image/jpeg'; // heic 上传端统一按 jpeg 声明（真机 chooseMedia 已转码）
    }
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success(res) {
        resolve(`data:${mime};base64,${res.data}`);
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '照片读取失败'));
      },
    });
  });
}

/**
 * 批量把 wx.chooseMedia 返回的临时文件转 base64 dataURL。
 * @param {Array<{tempFilePath: string}>} files
 * @returns {Promise<string[]>}
 */
function filesToBase64(files) {
  return Promise.all(files.map((f) => fileToBase64(f.tempFilePath || f)));
}

/**
 * 60 秒发送验证码倒计时工具：返回一个可取消的 ticker。
 * @param {(n: number) => void} onTick 每秒回调剩余秒数（0 表示结束）
 * @returns {() => void} cancel 取消函数
 */
function startCountdown(onTick) {
  let n = 60;
  onTick(n);
  const timer = setInterval(() => {
    n -= 1;
    onTick(n);
    if (n <= 0) {
      clearInterval(timer);
    }
  }, 1000);
  return () => clearInterval(timer);
}

module.exports = {
  ensureLogin,
  fileToBase64,
  filesToBase64,
  startCountdown,
};
