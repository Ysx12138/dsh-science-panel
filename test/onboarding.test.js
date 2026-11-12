import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function setup() {
  let factory, cursor=0, state=[], calls=[];
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),
    useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}]},
    useRef(initial){return {current:initial}},useEffect(){}};
  const context={window:{__ModuleLoader__:{load(x){factory=x.factory}}},URL,console,fetch:async(url,opts={})=>{
    calls.push({url,method:opts.method||'GET',body:opts.body?JSON.parse(opts.body):undefined});
    return {ok:true,json:async()=>url.endsWith('/provider-settings')?{baseUrl:JSON.parse(opts.body).baseUrl,keyConfigured:true}:{ok:true}};
  }};
  vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),context);
  let panel;factory(()=>React).apply({slots:{inject(_n,fn){fn()},register(e,f){if(e.key==='science-local')panel=f}}});
  const tree=panel(), page=tree.children[0];state=[];
  return {render(){cursor=0;return page.type(page.props)},calls};
}
function flatten(node,out=[]){if(node&&typeof node==='object'&&node.type){out.push(node);for(const c of node.children)flatten(c,out)}return out}

test('custom provider can be saved and started in one step',async()=>{
  const {render,calls}=await setup();let nodes=flatten(render());
  const inputs=nodes.filter(n=>n.type==='input');
  inputs[0].props.onChange({target:{value:'https://example.com/v1'}});
  inputs[1].props.onChange({target:{value:'test-model'}});
  inputs[2].props.onChange({target:{value:'fixture-key'}});
  nodes=flatten(render());await nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(calls[0].body.baseUrl,'https://example.com/v1');
  assert.equal(calls[0].body.model,'test-model');assert.equal(calls[0].body.key,'fixture-key');
  assert.equal(calls[1].url,'/science-panel/backend');assert.equal(calls[1].body.action,'start');
});

test('skip proceeds without saving or starting the backend',async()=>{
  const {render,calls}=await setup();const skip=flatten(render()).find(n=>n.props.className==='science-skip');
  assert.ok(skip);skip.props.onClick();assert.equal(calls.length,0);
});
