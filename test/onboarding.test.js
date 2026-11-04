import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('first visit asks for a key and starts after saving',async()=>{
 let factory,state=[],cursor=0,effects=[],calls=[];
 const React={createElement:(type,props,...children)=>({type,props:props||{},children}),
  useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},
  useRef(initial){return{current:initial}},useEffect(fn){effects.push(fn)}};
 const context={window:{__ModuleLoader__:{load(x){factory=x.factory;}}},URL,console,fetch:async(url,opts={})=>{
  calls.push([url,opts.method||'GET']);
  const data=url.endsWith('/provider-settings')?(opts.method==='POST'?{baseUrl:'https://opencode.ai/inference/anthropic/v1'}:{keyConfigured:false}):{ok:true};
  return {ok:true,json:async()=>data};
 }};
 vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),context);
 let panel;factory(()=>React).apply({slots:{inject(_n,fn){fn()},register(e,f){if(e.key==='science-local')panel=f}}});
 function render(){cursor=0;effects=[];return panel()}
 function flatten(node,out=[]){if(node&&typeof node==='object'&&node.type){out.push(node);for(const c of node.children)flatten(c,out)}return out}
 render();effects[0]();await new Promise(resolve=>setImmediate(resolve));
 const settings=flatten(render()).find(x=>typeof x.type==='function');assert.ok(settings);
 state=[];cursor=0;let form=settings.type(settings.props),key=flatten(form).find(x=>x.type==='input');assert.equal(key.props.required,true);
 key.props.onChange({target:{value:'fixture-key'}});cursor=0;form=settings.type(settings.props);
 await form.children[0].props.onSubmit({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));
 assert.ok(calls.some(([url,method])=>url.endsWith('/backend')&&method==='POST'));
});
