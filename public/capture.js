class Capture extends AudioWorkletProcessor {
 constructor(){super();this.parts=[];this.phase=0;}
 process(inputs){const data=inputs[0]?.[0];if(data){for(let i=0;i<data.length;i++){this.phase+=16000;while(this.phase>=sampleRate){this.phase-=sampleRate;this.parts.push(Math.max(-32768,Math.min(32767,Math.round(data[i]*32767))));if(this.parts.length===320){const a=new Int16Array(this.parts);this.port.postMessage(a.buffer,[a.buffer]);this.parts=[];}}}}return true;}
}
registerProcessor('voice-capture',Capture);
