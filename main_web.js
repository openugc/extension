// 提供给main站点的网页API调用
// 用途：
// 1. 监听content.js发送过来的消息处理
// 2. 向content.js发送消息
(function () {

  const MAIN_MSG_CALLBACKS = new Map();

  window.addEventListener('message', ({ data }) => {
    if (typeof data !== 'object') return;
    const { from, hash, result } = data;
    if (from !== 'contentjs') return;
    if (callback = MAIN_MSG_CALLBACKS.get(hash)) {
      callback(result);
      MAIN_MSG_CALLBACKS.delete(hash);
    }
  });


  window.SendPayload = async (act, data) => {
    const hash = (Math.random() * +new Date).toString(16).slice(0, 10);
    const payload = {
      act, data, hash, from: 'webjs'
    };
    return new Promise((RES, REJ) => {
      MAIN_MSG_CALLBACKS.set(hash, RES);
      window.postMessage(payload);
      // 超时
      // setTimeout(REJ, 1000 * 10);
    });
  }

})();
