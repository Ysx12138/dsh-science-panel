import {createInterface} from 'node:readline';
let stopCalls=0;
for await(const line of createInterface({input:process.stdin})){
 const value=JSON.parse(line);
 if(value.command==='configure_start' && value.key==='fixture-secret')console.log('DSH_SCIENCE_RESULT:'+JSON.stringify({ok:true,result:{status:'started',science_port:value.science_port}}));
 else if(value.command==='stop'){
  stopCalls++;
  if(process.argv.includes('--delay-stop'))await new Promise(resolve=>setTimeout(resolve,150));
  if(process.argv.includes('--fail-stop') && stopCalls===1)console.log('DSH_SCIENCE_RESULT:'+JSON.stringify({ok:false,error:'fixture cleanup not confirmed'}));
  else console.log('DSH_SCIENCE_RESULT:'+JSON.stringify({ok:true,result:{status:'stopped'}}));
 }
 else console.log('DSH_SCIENCE_RESULT:'+JSON.stringify({ok:false}));
}
