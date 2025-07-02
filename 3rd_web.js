(function () {
  // 调试输出，如果链接中有debug标志则输出
  const log = function () {
    if (!location.href.includes('debug')) return;
    console.log('[3rd_web]', ...arguments);
  }
  log('运行在第三方：web脚本', window['__FROMOPENUGC__'])
  if (!window['__FROMOPENUGC__']) return log('不是从主站启动的，忽略执行');

  // 提供给main站点的网页API调用

  const MAIN_MSG_CALLBACKS = new Map();

  window.addEventListener('message', ({ data }) => {
    // log('web.msg', data);
    if (typeof data !== 'object') return;
    const { from, hash, result, act, runHash } = data;
    if (from !== 'contentjs') return;
    // 如果是调用工具
    if (act === 'callMcpTool') {
      const { server, toolName, args } = data.data;
      const tool = MCPSERVER.tools.find(t => t.name === toolName);
      if (typeof tool.execute === 'string') tool.execute = new Function(`return ${tool.execute};`)();
      tool.execute(args).then(result => {
        SendPayload('callMcpToolResult', {
          server, toolName, result, runHash
        })
      })
      return;
    } else if (act === 'injectJs') {
      // 如果是执行js
      try {
        const func = new Function(data.data);
        func().then(res => {
          SendPayload('injectJsResult', {
            result: {
              success: true,
              data: res
            }, runHash
          })
        }).catch(err => {
          SendPayload('injectJsResult', {
            result: {
              success: false,
              error: err
            }, runHash
          })
        })
      } catch (e) {
        SendPayload('injectJsResult', {
          result: {
            success: false,
            error: err
          }, runHash
        })
      }
      return;
    }
    if (callback = MAIN_MSG_CALLBACKS.get(hash)) {
      callback(result);
      MAIN_MSG_CALLBACKS.delete(hash);
    }
  });


  const SendPayload = async (act, data) => {
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


  window.addEventListener('load', async () => {
    let js = await SendPayload('getMcpServerCode');
    // 验证格式：{开头，}结尾的js对象
    if (!js || typeof js !== 'string') return;
    js = js.trim();
    if (!js.startsWith('{') || !js.endsWith('}')) return;
    try {
      const server = new Function(`return ${js};`)();
      window.MCPSERVER = server;
      SendPayload('regMcpServer', JSON.stringify(server)).then(log);
    } catch (e) {
      log('create mcp server fail:', e)
    }
  })
})();