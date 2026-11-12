window.__ModuleLoader__.load({
  id: 'dsh-science-panel',
  factory: (require) => {
    const React = require('react');
    const {createElement: h, useRef, useEffect, useState} = React;
    const inject = ['slots'];
    const presets = {
      opencode: {label:'OpenCode（Qwen3.8 Flash）',baseUrl:'https://opencode.ai/inference/anthropic/v1',model:'qwen3.8-flash'},
      anthropic: {label:'Anthropic 官方（Claude Sonnet 4.6）',baseUrl:'https://api.anthropic.com/v1',model:'claude-sonnet-4-6'}
    };
    function Icon() { return h('span', {style:{fontSize:16}}, '◈'); }
    function ProviderSettings({onClose,onSaved}) {
      const [baseUrl,setBaseUrl]=useState(presets.opencode.baseUrl);
      const [model,setModel]=useState(presets.opencode.model);
      const [preset,setPreset]=useState('opencode');
      const [savedBaseUrl,setSavedBaseUrl]=useState('');
      const [key,setKey]=useState('');
      const [configured,setConfigured]=useState(false);
      const [message,setMessage]=useState('');
      const [busy,setBusy]=useState(false);
      useEffect(()=>{let active=true;fetch('/science-panel/provider-settings',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}).then(data=>{if(active){setConfigured(data.keyConfigured);if(data.keyConfigured){setBaseUrl(data.baseUrl);setSavedBaseUrl(data.baseUrl);setModel(data.model);setPreset(Object.keys(presets).find(id=>presets[id].baseUrl===data.baseUrl&&presets[id].model===data.model)||'custom');}}}).catch(error=>{if(active)setMessage(error.message||'无法读取设置');});return()=>{active=false;};},[]);
      const inputStyle={display:'block',width:'100%',boxSizing:'border-box',margin:'6px 0 16px',padding:'8px',border:'1px solid #aaa',borderRadius:'6px'};
      let sourceChanged=false;
      if(configured){try{sourceChanged=new URL(savedBaseUrl).origin!==new URL(baseUrl).origin;}catch{sourceChanged=true;}}
      function selectPreset(event){const value=event.target.value;setPreset(value);setKey('');if(presets[value]){setBaseUrl(presets[value].baseUrl);setModel(presets[value].model);}}
      async function save(event){
        event.preventDefault();setBusy(true);setMessage('');
        try{
          const response=await fetch('/science-panel/provider-settings',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({baseUrl,model,key})});
          const data=await response.json();if(!response.ok)throw new Error(data.error||'保存失败');
          setKey('');setConfigured(true);setSavedBaseUrl(data.baseUrl);setMessage('配置已保存。');onSaved?.();
        }catch(error){setMessage(error.message||'保存失败');}finally{setBusy(false);}
      }
      return h('div',{style:{position:'absolute',inset:0,zIndex:20,background:'rgba(0,0,0,.3)',display:'flex',alignItems:'center',justifyContent:'center'}},
        h('form',{onSubmit:save,style:{background:'var(--dsw-alias-bg-base, #fff)',color:'inherit',padding:'24px',borderRadius:'12px',width:'min(480px, 80%)',boxShadow:'0 8px 30px #0003'}},
          h('h2',null,'模型设置'),h('p',null,'选择服务，填入对应的 API Key。'),
          h('label',null,'模型服务',h('select',{style:inputStyle,value:preset,onChange:selectPreset},...Object.entries(presets).map(([id,p])=>h('option',{value:id,key:id},p.label)),h('option',{value:'custom'},'自定义 Anthropic 兼容服务'))),
          preset==='custom'?h('label',null,'服务地址',h('input',{style:inputStyle,value:baseUrl,onChange:e=>setBaseUrl(e.target.value),required:true,placeholder:'https://模型服务地址'})):null,
          preset==='custom'?h('label',null,'模型名称',h('input',{style:inputStyle,value:model,onChange:e=>setModel(e.target.value),required:true,placeholder:'服务商提供的模型名称'})):null,
          h('label',null,'API Key',h('input',{style:inputStyle,type:'password',value:key,onChange:e=>setKey(e.target.value),required:!configured||sourceChanged,placeholder:configured&&!sourceChanged?'已保存；留空保持不变':'请输入该服务的 API Key',autoComplete:'off'})),
          h('p',null,'Key 以明文保存在本机配置文件中，文件权限限制为当前用户。'),
          message?h('p',{role:'status'},message):null,
          h('button',{type:'submit',disabled:busy},busy?'保存中…':'保存设置'),' ',h('button',{type:'button',onClick:onClose},'关闭')));
    }
    function StartupPage({onStarted,onSkip}) {
      const [baseUrl,setBaseUrl]=useState('');
      const [model,setModel]=useState('');
      const [key,setKey]=useState('');
      const [configured,setConfigured]=useState(false);
      const [savedBaseUrl,setSavedBaseUrl]=useState('');
      const [preset,setPreset]=useState('custom');
      const [showKey,setShowKey]=useState(false);
      const [loading,setLoading]=useState(true);
      const [busy,setBusy]=useState(false);
      const [message,setMessage]=useState('');
      useEffect(()=>{let active=true;fetch('/science-panel/provider-settings',{cache:'no-store'}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'无法读取设置');return data;}).then(data=>{if(active){setBaseUrl(data.baseUrl||'');setModel(data.model||'');setConfigured(data.keyConfigured);setSavedBaseUrl(data.baseUrl||'');setPreset(Object.keys(presets).find(id=>presets[id].baseUrl===data.baseUrl&&presets[id].model===data.model)||'custom');}}).catch(error=>{if(active)setMessage(error.message||'无法读取设置');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
      let sourceChanged=false;
      if(configured){try{sourceChanged=new URL(savedBaseUrl).origin!==new URL(baseUrl).origin;}catch{sourceChanged=true;}}
      function selectPreset(event){const value=event.target.value;setPreset(value);setKey('');if(presets[value]){setBaseUrl(presets[value].baseUrl);setModel(presets[value].model);}}
      async function start(event){
        event.preventDefault();setBusy(true);setMessage('');
        try {
          const saved=await fetch('/science-panel/provider-settings',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({baseUrl,model,key})});
          const settings=await saved.json();if(!saved.ok)throw new Error(settings.error||'保存设置失败');
          setKey('');setConfigured(true);setSavedBaseUrl(settings.baseUrl);setMessage('正在启动 Science，首次启动可能需要较长时间…');
          const response=await fetch('/science-panel/backend',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action:'start'})});
          const data=await response.json();if(!response.ok)throw new Error(data.error||'启动失败');
          onStarted();
        } catch(error){setMessage(error.message||'启动失败');} finally{setBusy(false);}
      }
      return h('div',{className:'science-startup'},
        h('style',null,`
.science-startup{--ink:#292721;--muted:#817e73;--line:#ddd9ce;--accent:#c6613f;box-sizing:border-box;flex:1;min-height:0;overflow:auto;position:relative;background:#faf9f5;color:var(--ink);font-family:"Styrene A","Styrene B",-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;padding:calc(var(--dsh-frame-top-clearance, 48px) + 28px) 28px 42px}.science-startup *{box-sizing:border-box}.science-startup-inner{max-width:408px;margin:0 auto}.science-skip{position:absolute;top:calc(var(--dsh-frame-top-clearance, 48px) + 18px);right:30px;display:inline-flex;align-items:center;gap:10px;padding:9px 12px;border:0;border-radius:9px;background:transparent;color:#77736b;font:inherit;font-size:13px;font-weight:500;line-height:1.2;cursor:pointer;transition:background .15s,color .15s}.science-skip:hover:not(:disabled){background:#eeeae1;color:#292721}.science-skip:focus-visible{outline:2px solid #b95f42;outline-offset:2px}.science-skip:disabled{opacity:.45;cursor:wait}.science-skip-arrow{font-size:17px;line-height:1}.science-brand{display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;letter-spacing:-.02em}.science-mark{display:grid;place-items:center;width:30px;height:30px;color:var(--accent);font-size:29px;line-height:1}.science-main{padding-top:clamp(46px,10vh,104px)}.science-eyebrow{color:#a69e90;font-size:11px;font-weight:650;letter-spacing:.14em;text-transform:uppercase}.science-startup h1{margin:15px 0 12px;font-family:"Tiempos Text","Iowan Old Style","Songti SC",Georgia,serif;font-size:clamp(34px,4vw,43px);font-weight:400;letter-spacing:-.025em;line-height:1.3}.science-intro{margin:0;color:#77746b;font-size:14px;line-height:1.8}.science-form{margin-top:33px}.science-field{display:block;margin-bottom:19px}.science-label{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:13px;font-weight:600}.science-input-wrap{position:relative}.science-input{width:100%;height:46px;padding:0 14px;background:#fffefa;color:var(--ink);border:1px solid var(--line);border-radius:12px;font:inherit;font-size:14px;outline:none;transition:border-color .15s,box-shadow .15s}.science-input::placeholder{color:#b6b1a6}.science-input:focus{border-color:#ba775e;box-shadow:0 0 0 3px #c6613f1a}.science-input-key{padding-right:66px}.science-reveal{position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:#807a6d;font-size:12px;cursor:pointer;padding:7px}.science-hint{margin:8px 0 0;color:#999388;font-size:12px;line-height:1.6}.science-submit{width:100%;height:48px;margin-top:7px;border:0;border-radius:12px;background:var(--accent);color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s}.science-submit:hover:not(:disabled){background:#ae5235}.science-submit:disabled{opacity:.55;cursor:wait}.science-submit:focus-visible,.science-reveal:focus-visible{outline:2px solid #a65338;outline-offset:3px}.science-status{margin:14px 0 0;font-size:13px;line-height:1.6;color:#a34d35;overflow-wrap:anywhere}.science-footer{margin-top:30px;padding-top:18px;border-top:1px solid #e8e5dc;color:#a09a8e;font-size:12px;line-height:1.7}.science-footer strong{color:#777166;font-weight:500}@media(max-width:520px){.science-startup{padding-left:22px;padding-right:22px}.science-main{padding-top:45px}}
`),
        h('button',{className:'science-skip',type:'button',disabled:busy,onClick:onSkip,'aria-label':'跳过配置，进入 Science'},'Skip',h('span',{className:'science-skip-arrow','aria-hidden':'true'},'→')),
        h('div',{className:'science-startup-inner'},
          h('div',{className:'science-brand'},h('span',{className:'science-mark','aria-hidden':'true'},'✳'),h('span',null,'Claude Science')),
          h('main',{className:'science-main'},
            h('div',{className:'science-eyebrow'},'A SPACE FOR THINKING'),
            h('h1',null,'开始探索。'),
            h('p',{className:'science-intro'},'连接你的模型服务，为接下来的研究做好准备。'),
            h('form',{className:'science-form',onSubmit:start},
              h('label',{className:'science-field'},h('span',{className:'science-label'},'模型服务'),h('select',{className:'science-input',value:preset,onChange:selectPreset},h('option',{value:'custom'},'自定义 Anthropic 兼容服务'),...Object.entries(presets).map(([id,p])=>h('option',{value:id,key:id},p.label)))),
              h('label',{className:'science-field'},h('span',{className:'science-label'},'服务地址'),h('input',{className:'science-input',value:baseUrl,onChange:e=>{setBaseUrl(e.target.value);setPreset('custom');},required:true,type:'url',placeholder:'https://api.example.com',autoComplete:'url'})),
              h('label',{className:'science-field'},h('span',{className:'science-label'},'模型名称'),h('input',{className:'science-input',value:model,onChange:e=>{setModel(e.target.value);setPreset('custom');},required:true,placeholder:'输入服务商提供的模型名称',autoComplete:'off'})),
              h('div',{className:'science-field'},h('label',{className:'science-label',htmlFor:'science-api-key'},'API Key'),h('div',{className:'science-input-wrap'},h('input',{id:'science-api-key',className:'science-input science-input-key',type:showKey?'text':'password',value:key,onChange:e=>setKey(e.target.value),required:!configured||sourceChanged,placeholder:configured&&!sourceChanged?'已保存，留空保持不变':'输入你的 API Key',autoComplete:'off',spellCheck:false}),h('button',{className:'science-reveal',type:'button',onClick:()=>setShowKey(!showKey),'aria-label':showKey?'隐藏 API Key':'显示 API Key'},showKey?'隐藏':'显示')),h('p',{className:'science-hint'},'请使用支持 Anthropic 接口的模型服务。')),
              h('button',{className:'science-submit',type:'submit',disabled:busy||loading},busy?'正在启动…':loading?'正在读取设置…':'保存并启动  →'),
              message?h('p',{className:'science-status',role:'status'},message):null),
            h('div',{className:'science-footer'},h('strong',null,'关于你的密钥'),h('br'), 'API Key 以明文保存在本机配置文件中，文件权限限制为当前用户。'))));
    }
    function SciencePanel() {
      const mount = useRef(null);
      const [error, setError] = useState('');
      const [attempt, setAttempt] = useState(0);
      const [settingsOpen,setSettingsOpen]=useState(false);
      const [started,setStarted]=useState(false);
      const [skipped,setSkipped]=useState(false);
      const [backendRunning,setBackendRunning]=useState(false);
      const [backendBusy,setBackendBusy]=useState(false);
      const [backendMessage,setBackendMessage]=useState('');
      async function controlBackend(action){
        setBackendBusy(true);setBackendMessage(action==='start'?'正在准备 Science；首次使用会自动下载官方程序，请稍候…':'正在停止…');
        try{
          const response=await fetch('/science-panel/backend',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action})});
          const data=await response.json();if(!response.ok)throw new Error(data.error||'操作失败');
          setBackendRunning(action==='start');setBackendMessage(action==='start'?'隔离 Science 已启动':'隔离 Science 已停止');setAttempt(n=>n+1);
        }catch(error){setBackendMessage(error.message||'操作失败');}finally{setBackendBusy(false);}
      }

      useEffect(() => {
        if(!started||(!backendRunning&&!skipped))return;
        const host = mount.current;
        const bridge = globalThis.dshDesktop?.browser;
        let closed = false, lease, guest, allowedPort;
        const downloadKey = crypto.randomUUID();
        const localization = fetch('/science-panel/localization', {cache:'no-store'}).then(response => {
          if (!response.ok) throw new Error('无法读取 Science 汉化资源');
          return response.text();
        });
        function showDownloadNotice(message, failed = false) {
          if (closed || !guest) return;
          const script = `(()=>{let n=document.getElementById('dsh-science-download-notice');if(!n){n=document.createElement('div');n.id='dsh-science-download-notice';n.setAttribute('role','status');Object.assign(n.style,{position:'fixed',right:'24px',bottom:'24px',zIndex:'2147483647',maxWidth:'min(420px, calc(100vw - 48px))',padding:'12px 16px',borderRadius:'8px',boxShadow:'0 4px 18px rgba(0,0,0,.18)',font:'14px/1.5 system-ui',color:'#fff',overflowWrap:'anywhere'});document.body.appendChild(n)}n.style.background=${JSON.stringify(failed ? '#9b2929' : '#26332c')};n.textContent=${JSON.stringify(message)};clearTimeout(window.__dshScienceNoticeTimer);window.__dshScienceNoticeTimer=setTimeout(()=>n.remove(),6000)})()`;
          guest.executeJavaScript(script).catch(() => {});
        }
        async function start() {
          if (!bridge || !host) throw new Error('当前 DSH 窗口不支持内嵌面板。');
          const reservation = await bridge.acquire('science-panel-local');
          lease = reservation.lease;
          if (closed) { await bridge.release(lease); return; }
          guest = document.createElement('webview');
          guest.setAttribute('name', lease); guest.setAttribute('partition', reservation.partition);
          guest.setAttribute('src', 'about:blank#' + lease);
          guest.setAttribute('aria-label', 'Claude Science');
          Object.assign(guest.style, {width:'100%',height:'100%',display:'flex',flex:'1'});
          guest.addEventListener('dom-ready', async function initial() {
            guest.removeEventListener('dom-ready', initial);
            try {
              const response = await fetch('/science-panel/login', {method:'POST', cache:'no-store'});
              if (!response.ok) throw new Error('无法连接 Science，请先打开 Science 本地窗口。');
              const data = await response.json();
              const url = new URL(data.url);
              allowedPort = data.port;
              if (url.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || Number(url.port) !== allowedPort) throw new Error('登录地址无效');
              if (!closed) await guest.loadURL(url.href);
            } catch(e) { if (!closed) setError(e.message || 'Science 连接失败'); }
          });
          guest.addEventListener('did-fail-load', e => { if (!closed && e.isMainFrame && e.errorCode !== -3) setError('Science 页面加载失败，请重试。'); });
          guest.addEventListener('console-message', async event => {
            const prefix = `DSH_SCIENCE_DOWNLOAD:${downloadKey}:`;
            if (closed || !event.message?.startsWith(prefix)) return;
            try {
              const request = JSON.parse(event.message.slice(prefix.length));
              showDownloadNotice('正在保存文件…');
              const response = await fetch('/science-panel/download-artifact', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),cache:'no-store'});
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || '保存失败');
              showDownloadNotice(`已保存到“下载”文件夹：${data.filename}`);
            } catch(e) { showDownloadNotice(`下载失败：${e.message || '请重试'}`, true); }
          });
          guest.addEventListener('did-stop-loading', () => {
            if (closed) return;
            try {
              const current = new URL(guest.getURL());
              if (current.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(current.hostname) || Number(current.port) !== allowedPort || current.pathname.startsWith('/api/auth/')) return;
              guest.executeJavaScript("(()=>{const f=document.querySelector('form[action=\"./api/auth/nonce\"]');if(f)f.submit()})()").catch(() => {});
              const script = `(()=>{if(window.__dshScienceDownloadInstalled)return;window.__dshScienceDownloadInstalled=true;let armed=0;document.addEventListener('click',e=>{const el=e.target instanceof Element?e.target.closest('button[data-testid="artifact-download"],button[aria-label="Download"][title="Download this artifact"],button[aria-label="下载"][title="Download this artifact"]'):null;if(e.isTrusted&&el)armed=Date.now()+15000},true);const original=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){try{if(Date.now()<armed){const u=new URL(this.href,location.href);const m=u.origin===location.origin&&u.pathname.match(/^\\/api\\/artifacts\\/(versions\\/)?([0-9a-f-]{36})$/i);if(m){armed=0;console.log('DSH_SCIENCE_DOWNLOAD:${downloadKey}:'+JSON.stringify(m[1]?{versionId:m[2]}:{artifactId:m[2]}));return;}}}catch{}return original.apply(this,arguments)}})()`;
              guest.executeJavaScript(script).catch(() => {});
              localization.then(code => {
                if (closed) return;
                const latest = new URL(guest.getURL());
                if (latest.origin !== current.origin || latest.pathname.startsWith('/api/auth/')) return;
                return guest.executeJavaScript(code);
              }).catch(error => console.warn('Science 汉化加载失败:',error));
            } catch { /* The bootstrap page is about:blank. */ }
          });
          host.replaceChildren(guest);
        }
        setError(''); start().catch(e => {if (!closed) setError(e.message || 'Science 连接失败');});
        return () => { closed = true; guest?.remove(); if (lease) bridge?.release(lease).catch(()=>{}); };
      }, [attempt,backendRunning,started,skipped]);
      if(!started)return h('div',{style:{height:'100%',minHeight:0,display:'flex',flexDirection:'column'}},
        h(StartupPage,{onStarted:()=>{setBackendRunning(true);setSkipped(false);setStarted(true);},onSkip:()=>{setSkipped(true);setStarted(true);}}));
      return h('div',{style:{height:'100%',minHeight:0,position:'relative',display:'flex',flexDirection:'column',background:'var(--dsw-alias-bg-base)'}},
        h('div',{style:{padding:'8px 16px',paddingTop:'calc(var(--dsh-frame-top-clearance, 48px) + 8px)'}},
          h('button',{onClick:()=>setSettingsOpen(true)},'模型设置'),' ',
          h('button',{disabled:backendBusy,onClick:()=>controlBackend(backendRunning?'stop':'start')},backendRunning?'停止隔离 Science':'启动隔离 Science'),
          backendMessage?h('span',{role:'status',style:{marginLeft:'12px'}},backendMessage):null),
        settingsOpen?h(ProviderSettings,{onClose:()=>setSettingsOpen(false),onSaved:()=>{setSettingsOpen(false);if(!backendRunning)controlBackend('start');else setBackendMessage('设置已保存，停止后重新启动生效。')}}):null,
        error ? h('div',{role:'alert',style:{padding:'16px'}},error,' ',h('button',{onClick:()=>setAttempt(n=>n+1)},'重试')) : null,
        h('div',{ref:mount,style:{flex:1,minHeight:0,display:'flex'}}));
    }
    function apply(ctx) {
      ctx.slots.inject('main', () => ctx.slots.register({name:'main',key:'science-local'}, SciencePanel));
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name:'sidebar.panellist',id:'science-local',order:20,label:()=> 'Claude Science'}, Icon));
    }
    return {apply, inject};
  }
});
