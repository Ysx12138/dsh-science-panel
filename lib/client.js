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
    function ProviderSettings({onClose}) {
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
          setKey('');setConfigured(true);setSavedBaseUrl(data.baseUrl);setMessage('配置已保存。关闭此窗口后点击“启动隔离 Science”。');
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
    function SciencePanel() {
      const mount = useRef(null);
      const [error, setError] = useState('');
      const [attempt, setAttempt] = useState(0);
      const [settingsOpen,setSettingsOpen]=useState(false);
      const [backendRunning,setBackendRunning]=useState(false);
      const [backendBusy,setBackendBusy]=useState(false);
      const [backendMessage,setBackendMessage]=useState('');
      async function controlBackend(action){
        setBackendBusy(true);setBackendMessage(action==='start'?'正在启动隔离 Science，首次启动可能需要较长时间…':'正在停止…');
        try{
          const response=await fetch('/science-panel/backend',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify({action})});
          const data=await response.json();if(!response.ok)throw new Error(data.error||'操作失败');
          setBackendRunning(action==='start');setBackendMessage(action==='start'?'隔离 Science 已启动':'隔离 Science 已停止');setAttempt(n=>n+1);
        }catch(error){setBackendMessage(error.message||'操作失败');}finally{setBackendBusy(false);}
      }

      useEffect(() => {
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
      }, [attempt]);
      return h('div',{style:{height:'100%',minHeight:0,position:'relative',display:'flex',flexDirection:'column',background:'var(--dsw-alias-bg-base)'}},
        h('div',{style:{padding:'8px 16px',paddingTop:'calc(var(--dsh-frame-top-clearance, 48px) + 8px)'}},
          h('button',{onClick:()=>setSettingsOpen(true)},'模型设置'),' ',
          h('button',{disabled:backendBusy,onClick:()=>controlBackend(backendRunning?'stop':'start')},backendRunning?'停止隔离 Science':'启动隔离 Science'),
          backendMessage?h('span',{role:'status',style:{marginLeft:'12px'}},backendMessage):null),
        settingsOpen?h(ProviderSettings,{onClose:()=>setSettingsOpen(false)}):null,
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
