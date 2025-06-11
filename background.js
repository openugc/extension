(function () {
  // 1. main为入口站，监听这个站的任务，比如打开插件
  // 2. 打开插件后，注册插件tab为port，通过port通信
  // 3. web <=> addEventListener <=> port

  // 存储两个网页的端口
  const PORTS_MAP = new Map();

  // MCP服务缓存
  const MCP_SERVERS = new Map();

  const TOOL_CALLBACKS = new Map();
  const INJECT_CALLBACKS = new Map();

  // 动态注册MC P服务的JS缓存
  // 由main推送过来并进行注册（提供者）
  // 由插件tab进行查询获取并执行（消费者）
  const MCP_SERVERS_CODES = new Map();

  const CallMcpTool = async (hash, server, toolName, args) => {
    const mcpServer = MCP_SERVERS.get(server);
    if (!mcpServer) throw new Error('mcp服务不存在');
    const tool = mcpServer.tools.find(tool => tool.name === toolName);
    if (!tool) throw new Error('工具不存在');
    // return await tool.execute(args);
    // todo
    // 向server的port发送消息，并等待执行结果
    const port = PORTS_MAP.get(server);
    if (!port) throw new Error('mcp端口不存在');
    const runHash = (Math.random() * +new Date).toString(16).slice(0, 10);
    port.postMessage({
      hash,
      runHash,
      act: 'callMcpTool',
      data: {
        toolName,
        args
      }
    });
    return new Promise(RES => {
      TOOL_CALLBACKS.set(runHash, RES);
    });
    // return 'exec success'
  }

  // 接收来自网页A的消息
  chrome.runtime.onConnect.addListener((port) => {
    console.log('bg.getport', port);
    PORTS_MAP.set(port.name, port);
    if (port.name === 'main') {
      // 监听主站的消息
      port.onMessage.addListener((msg) => {
        console.log('[bg.main.msg]', msg);
        if (typeof msg !== 'object') return;
        const { hash, act, data } = msg;
        const returnResult = result => {
          return port.postMessage({
            hash, act, result
          });
        }
        switch (act) {
          case 'ping':
            returnResult('pong');
            break;
          case 'addMcpServerCode':
            MCP_SERVERS_CODES.set(data.id, data.code);
            returnResult(true);
            break;
          case 'getMcpServers':
            const servers = [];
            for (const [key, value] of MCP_SERVERS) {
              servers.push({
                name: key,
                server: value
              });
            }
            // console.log('start post:', servers)
            // port.postMessage({ act, hash, result: servers })
            returnResult(servers);
            break;
          // 创建插件tab
          case 'createTab':
            chrome.tabs.create({ url: data['url'], active: false }, tab => {
              // 执行 JavaScript 代码
              // 作用：在页面加载之前执行，达到HOOK效果
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (data) => {
                  // 添加一个TAG，让页面进行判断是否是从主站启动的
                  // 如果不是，则不执行代码
                  window.__FROMOPENUGC__ = true;
                  const { url, code } = data;
                  if (!code) return;
                  new Function(code)();
                },
                args: [data],
                world: 'MAIN', // 确保在主页面上下文中执行
                injectImmediately: true // 立即注入，不等待页面加载完成
              });
              returnResult(tab.id)
            });
            break;
          // 调用工具
          case 'callMcpTool':
            const { server, toolName, args } = data;
            CallMcpTool(hash, server, toolName, args).then(result => {
              returnResult({
                success: true,
                data: result
              })
            }).catch(err => {
              returnResult({
                success: false,
                errmsg: err.message
              })
            })
            break;
          // 向特定的插件服务注入js执行
          case 'injectJs':
            const serverPort = PORTS_MAP.get(data.server);
            if (!serverPort) return returnResult({
              msg: 'mcp服务不存在',
              server,
            });
            const runHash = (Math.random() * +new Date).toString(16).slice(0, 10);
            INJECT_CALLBACKS.set(runHash, result => {
              returnResult({
                success: true,
                data: result
              })
            });
            serverPort.postMessage({
              act: 'injectJs',
              hash,
              runHash,
              data: data.js
            })
            break;
        }
        // 发送消息给网页A
        // PORTS_MAP.get('pageA').postMessage(msg);
      });
      port.onDisconnect.addListener(() => {
        console.log("main Port disconnected");
        PORTS_MAP.delete(port.name)
      });
    } else {
      // 其他站的消息
      port.onMessage.addListener((msg) => {
        console.log('[bg.3rd.msg]', msg);
        // 发送消息给网页B
        // PORTS_MAP.get('pageB').postMessage(msg);
        if (typeof msg !== 'object') return;
        const { hash, act, data } = msg;
        switch (act) {
          case 'regMcpServer':
            // 注册MCP服务
            const server = JSON.parse(data);
            MCP_SERVERS.set(port.name, server);
            port.postMessage({
              act, hash, result: {
                msg: 'mcp注册成功',
                server: MCP_SERVERS.get(port.name),
                id: port.name
              }
            })
            break;
          case "callMcpToolResult":
            // 工具调用结果
            const { runHash, result } = msg.data;
            if (callback = TOOL_CALLBACKS.get(runHash)) {
              callback(result);
              TOOL_CALLBACKS.delete(runHash);
            }
            // 发送给main
            // PORTS_MAP.get('main').postMessage(msg);
            break;
          case "injectJsResult":
            // js注入执行结果
            const d = msg.data;
            if (callback = INJECT_CALLBACKS.get(d.runHash)) {
              callback(d.result);
              INJECT_CALLBACKS.delete(d.runHash);
            }
            break;
          case 'getMcpServerCode':
            // 动态获取MCP定义脚本，如果有则执行注册
            // 向main端口发送消息查询
            // console.log('find the js for port:', port.name);
            // PORTS_MAP.get('main').postMessage({
            let code = MCP_SERVERS_CODES.get(port.name);
            if (!code) code = MCP_SERVERS_CODES.get('*');

            // })
            return port.postMessage({
              act, hash, result: code
            })
            break;
        }
      });
      port.onDisconnect.addListener(() => {
        console.log("3rd Port disconnected");
        MCP_SERVERS.delete(port.name);
        PORTS_MAP.delete(port.name)
      });
    }
  });


  // background.js
  // chrome.alarms.create("loopAlarm", { periodInMinutes: 0.01 }); // 每分钟触发一次
  chrome.alarms.create("loopAlarm", { periodInMinutes: 0.5 }); // 每半分钟触发一次

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "loopAlarm") {
      console.log("Alarm triggered!", new Date());
      // 执行定时任务
      // 1. 激活pinned=true的标签页，保持在线
      // todo: 不要使用pinned,不然关闭浏览器启动后还在，不行！
      // chrome.tabs.query({ pinned: true }, tabs => {
      //   tabs.map(t => {
      //     chrome.tabs.update(t.id, { active: t.active })
      //   })
      // })
    }
  });

  // chrome.runtime.connect();



  // 安装事件
  // 让主站支持使用Fetch进行跨域访问URL
  chrome.runtime.onInstalled.addListener(() => {
    console.log('installed handle..');
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1], // 移除旧规则（如果有）
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: "modifyHeaders",
            responseHeaders: [
              {
                header: "Access-Control-Allow-Origin",
                operation: "set",
                value: "*"
              }, {
                header: "Modify-By",
                operation: "set",
                value: "openugc"
              }
            ]
          },
          condition: {
            urlFilter: "*://*/*",
            initiatorDomains: ["chat.openugc.com"],
            resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest"]
          }
        }
      ]
    });
  });


  // tab事件，点击后打开主站
  chrome.action.onClicked.addListener(function (tab) {
    const homepageUrl = "https://chat.openugc.com";

    // 检查是否已经打开了指定的主页
    chrome.tabs.query({ url: homepageUrl + '/*' }, function (tabs) {
      if (tabs.length > 0) {
        // 如果已经打开，切换到该标签页
        chrome.tabs.update(tabs[0].id, { active: true });
      } else {
        // 如果没有打开，创建一个新的标签页
        chrome.tabs.create({ url: homepageUrl });
      }
    });
  });

})();