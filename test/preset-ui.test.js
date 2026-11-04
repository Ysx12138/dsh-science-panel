import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('first-time model form uses a key-only preset and switches providers',async()=>{
  let factory, cursor=0, state=[], panel=true, sent;
  const React={
    createElement:(type,props,...children)=>({type,props:props||{},children}),
    useRef:()=>({current:null}),
    useEffect:()=>{},
    useState(initial){const i=cursor++;if(!(i in state))state[i]=panel&&i===2?true:initial;return [state[i],value=>{state[i]=value}];}
  };
  const context={window:{__ModuleLoader__:{load(x){factory=x.factory;}}},URL,console,fetch:async(url,options)=>{
    sent=JSON.parse(options.body);
    return {ok:true,json:async()=>({baseUrl:sent.baseUrl})};
  }};
  vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),context);
  let component;
  factory(()=>React).apply({slots:{inject(_name,fn){fn()},register(entry,fn){if(entry.key==='science-local')component=fn;}}});
  const panelTree=component();
  const settingsNode=panelTree.children.find(x=>x&&typeof x.type==='function');
  assert.ok(settingsNode);
  panel=false;state=[];
  function render(){cursor=0;return settingsNode.type({onClose(){}})}
  function elements(node,out=[]){if(node&&typeof node==='object'&&node.type){out.push(node);for(const c of node.children)elements(c,out)}return out}
  let form=render(),nodes=elements(form),select=nodes.find(x=>x.type==='select');
  assert.equal(select.props.value,'opencode');
  assert.equal(nodes.filter(x=>x.type==='input').length,1);
  const key=nodes.find(x=>x.type==='input');assert.equal(key.props.required,true);key.props.onChange({target:{value:'fixture-key'}});
  form=render();
  await form.children[0].props.onSubmit({preventDefault(){}});
  assert.equal(sent.baseUrl,'https://opencode.ai/inference/anthropic/v1');assert.equal(sent.model,'qwen3.8-flash');assert.equal(sent.key,'fixture-key');
  form=render();nodes=elements(form);select=nodes.find(x=>x.type==='select');select.props.onChange({target:{value:'anthropic'}});
  form=render();nodes=elements(form);assert.equal(nodes.find(x=>x.type==='input').props.required,true);
});
