import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('startup presets fill the provider address and model while leaving them editable',async()=>{
  let factory,cursor=0,state=[];
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useRef:()=>({current:null}),useEffect(){},
    useState(initial){const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=v}]}};
  vm.runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load(x){factory=x.factory}}},URL,console});
  let panel;factory(()=>React).apply({slots:{inject(_n,fn){fn()},register(e,f){if(e.key==='science-local')panel=f}}});
  const page=panel().children[0];state=[];
  function render(){cursor=0;return page.type(page.props)}
  function flatten(n,out=[]){if(n&&typeof n==='object'&&n.type){out.push(n);for(const c of n.children)flatten(c,out)}return out}
  let nodes=flatten(render());nodes.find(n=>n.type==='select').props.onChange({target:{value:'opencode'}});
  nodes=flatten(render());const inputs=nodes.filter(n=>n.type==='input');
  assert.equal(inputs[0].props.value,'https://opencode.ai/inference/anthropic/v1');
  assert.equal(inputs[1].props.value,'qwen3.8-flash');
  inputs[0].props.onChange({target:{value:'https://example.com/v1'}});
  nodes=flatten(render());assert.equal(nodes.find(n=>n.type==='select').props.value,'custom');
});
