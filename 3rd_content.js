(function () {
  // 调试输出，如果链接中有debug标志则输出
  const log = function () {
    if (!location.href.includes('debug')) return;
    console.log('[3rd_web]', ...arguments);
  }

  log('运行在第三方站的内容脚本', window['__FROMOPENUGC__'], location);

  var PORT = null;
  const MSG_CALLBACKS = new Map();
  const createPort = () => {
    const port = chrome.runtime.connect({ name: location.host });


    // bg发送过来的数据
    // post也是发送到bg
    port.onMessage.addListener(msg => {
      // log('[main.msg]', msg)
      if (typeof msg !== 'object') return;
      const { act, hash, result, data, runHash } = msg;
      // 如果是调用mcp工具的信息
      if (act === 'callMcpTool') {
        window.postMessage({
          hash,
          act,
          data,
          runHash,
          from: 'contentjs'
        });
        return;
      } else if (act === 'injectJs') {
        window.postMessage({
          hash,
          act,
          data,
          runHash,
          from: 'contentjs'
        });
        return;
      }
      if (callback = MSG_CALLBACKS.get(hash)) {
        callback(result);
        MSG_CALLBACKS.delete(hash);
      }
    });
    return port;
  }



  // 监听web脚本
  // 转发
  window.addEventListener('message', async event => {
    // log('[event]', event)
    const { act, data, hash, from } = event.data;
    if (from !== 'webjs') return;
    if (!PORT) PORT = createPort();
    PORT.postMessage({
      act, data, hash
    })
    MSG_CALLBACKS.set(hash, (result) => {
      window.postMessage({
        hash,
        result,
        from: 'contentjs'
      });
    });
  });

})();