(function () {

  console.log('运行在第三方站的内容脚本');


  const port = chrome.runtime.connect({ name: location.host });
  const MSG_CALLBACKS = new Map();

  // bg发送过来的数据
  // post也是发送到bg
  port.onMessage.addListener(msg => {
    // console.log('[main.msg]', msg)
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


  // 监听web脚本
  // 转发
  window.addEventListener('message', async event => {
    // console.log('[event]', event)
    const { act, data, hash, from } = event.data;
    if (from !== 'webjs') return;
    port.postMessage({
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