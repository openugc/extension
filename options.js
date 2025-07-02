// main站点的content.js
// 用途：
// 1. 监听web发送过来的消息，转发给bg
// 2. 监听bg发送过来的消息，转发给web

(function () {

  const MSG_CALLBACKS = new Map();
  // 连接bg
  const createPort = () => {
    const port = chrome.runtime.connect({ name: 'main' });
    // 监听bg发送过来的消息，转发给web
    port.onMessage.addListener(msg => {
      // console.log('[main.msg]', msg)
      if (typeof msg !== 'object') return;
      const { act, hash, result } = msg;
      if (callback = MSG_CALLBACKS.get(hash)) {
        callback(result);
        MSG_CALLBACKS.delete(hash);
      }
    });
    return port;
  }



  // 监听web脚本
  // 转发
  var port = createPort();
  window.addEventListener('message', async event => {
    // console.log('[event]', event)
    const { act, data, hash, from } = event.data;
    if (from !== 'webjs') return;
    try {
      port.postMessage({
        act, data, hash
      })
    } catch (e) {
      console.log('=== err 发送给worker失败 ', e);
      window.postMessage({
        hash,
        result: {
          success: false,
          errmsg: '连接插件服务失败'
        },
        from: 'contentjs'
      });
      // 重新连接
      port = createPort();
      return false;
    }
    MSG_CALLBACKS.set(hash, (result) => {
      window.postMessage({
        hash,
        result,
        from: 'contentjs'
      });
    });
  });


  console.log('test:', chrome.runtime.getManifest());
})();

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
