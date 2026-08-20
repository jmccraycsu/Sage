const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = __dirname, DATA = path.join(ROOT,'data.json'), PUBLIC = path.join(ROOT,'public');
// Tiny .env loader so the demo stays dependency-free. Production should use a secret manager.
const envFile=path.join(ROOT,'.env');
if(fs.existsSync(envFile)) fs.readFileSync(envFile,'utf8').split(/\r?\n/).forEach(line=>{const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')});
const tokens = new Map();
const read = () => JSON.parse(fs.readFileSync(DATA,'utf8'));
const write = d => fs.writeFileSync(DATA,JSON.stringify(d,null,2));
const send=(res,status,data,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type==='application/json'?JSON.stringify(data):data)};
const body=req=>new Promise((ok,no)=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e6)req.destroy()});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch(e){no(e)}})});
const userFor=req=>{const t=(req.headers.authorization||'').replace('Bearer ',''); const id=tokens.get(t); return read().users.find(u=>u.id===id)};
const id=prefix=>prefix+crypto.randomBytes(6).toString('hex');
function safeUser(u){if(!u)return null;let {password,...x}=u;return x}
function aiReply(text, mode, names){
  const t=text.toLowerCase(); let r;
  if(/(suicid|kill myself|hurt myself|not safe)/.test(t)) return "I’m really glad you said that out loud. Your immediate safety matters more than this session. If you might act now, call 911 or 988 in the U.S., or go to the nearest emergency department. Can you move near another person and tell me: are you in immediate danger right now?";
  if(/(hit|abuse|violent|afraid|threat)/.test(t)) return "I hear a possible safety concern. Couples exercises are not appropriate when someone fears retaliation. Please prioritize a private safety plan and contact a trusted local domestic-violence resource; in the U.S. you can call 800-799-SAFE or text START to 88788. Are you physically safe to continue?";
  if(/angry|mad|fight|argument|yell/.test(t)) r="Let’s slow it way down. Anger often protects something more tender—hurt, fear, disrespect, or loneliness. Finish this without blame: ‘When that happened, the story I told myself was… and what I needed was…’";
  else if(/trust|cheat|betray|affair/.test(t)) r="Betrayal can make your nervous system scan for danger long after the facts are known. We don’t have to rush forgiveness. What would one observable, repeatable act of safety look like this week?";
  else if(/listen|heard|understand/.test(t)) r="Before solving it, let’s reflect it. Say: ‘What I hear matters most to you is… Did I get that right?’ The goal isn’t agreement yet—it’s accurate understanding.";
  else if(/boundary|space|alone|break/.test(t)) r="A healthy pause has a bridge back. Try: ‘I care about this and I’m too activated to do it well. I need 20 minutes, and I will come back at 7:40.’ What return time would feel credible?";
  else if(/sad|lonely|hurt|tired/.test(t)) r="That sounds heavy. You don’t have to make it neat for me. Where do you feel it in your body—and if that feeling could ask for one thing without apologizing, what would it ask for?";
  else r="I’m with you. Let’s get underneath the headline: what happened, what did you make it mean, and what are you hoping could be different? Take your time.";
  if(mode==='joint') r = "I want to make room for both of you. " + r + " After one person answers, the other’s only job is to reflect back what they heard.";
  return r;
}
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://x'), p=u.pathname, m=req.method;
  if(p==='/api/login'&&m==='POST'){const b=await body(req),d=read(),user=d.users.find(x=>x.email.toLowerCase()===String(b.email).toLowerCase()&&x.password===b.password);if(!user)return send(res,401,{error:'Email or password is incorrect'});const t=crypto.randomBytes(24).toString('hex');tokens.set(t,user.id);return send(res,200,{token:t,user:safeUser(user)});}
  if(p==='/api/register'&&m==='POST'){const b=await body(req),d=read();if(d.users.some(x=>x.email.toLowerCase()===String(b.email).toLowerCase()))return send(res,409,{error:'An account already exists'});const user={id:id('u'),name:b.name,email:b.email,password:b.password,partnerId:null,avatar:b.name[0].toUpperCase(),createdAt:new Date().toISOString()};d.users.push(user);write(d);const t=crypto.randomBytes(24).toString('hex');tokens.set(t,user.id);return send(res,201,{token:t,user:safeUser(user)});}
  const me=userFor(req); if(p.startsWith('/api/')&&!me)return send(res,401,{error:'Please sign in'}); const d=read();
  if(p==='/api/bootstrap'){const partner=d.users.find(x=>x.id===me.partnerId);return send(res,200,{user:safeUser(me),partner:safeUser(partner),sessions:d.sessions.filter(x=>x.participants.includes(me.id)||x.ownerId===me.id),goals:d.goals.filter(x=>x.ownerId===me.id),journal:d.journal.filter(x=>x.ownerId===me.id)});}
  // Mint a short-lived browser credential. The permanent OpenAI key never leaves this server.
  if(p==='/api/realtime-transcription-token'&&m==='POST'){
   if(!process.env.OPENAI_API_KEY)return send(res,503,{error:'OpenAI Realtime transcription is not configured. Add OPENAI_API_KEY to .env.'});
   const safetyId=crypto.createHash('sha256').update('sage:'+me.id).digest('hex');
   const upstream=await fetch('https://api.openai.com/v1/realtime/client_secrets',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json','OpenAI-Safety-Identifier':safetyId},body:JSON.stringify({expires_after:{anchor:'created_at',seconds:600},session:{type:'transcription',audio:{input:{noise_reduction:{type:'near_field'},transcription:{model:'gpt-live-transcribe',language:'en',prompt:'A private relationship conversation. Preserve names, punctuation, and the speaker’s exact meaning.'},turn_detection:{type:'server_vad',threshold:0.5,prefix_padding_ms:300,silence_duration_ms:700}}}}})});
   const result=await upstream.json();if(!upstream.ok){console.error('OpenAI token error',upstream.status,result);return send(res,upstream.status,{error:result.error?.message||'Could not start realtime transcription'});}return send(res,200,result);
  }
  if(p==='/api/cartesia-token'&&m==='POST'){
   if(!process.env.CARTESIA_API_KEY||!process.env.CARTESIA_VOICE_ID)return send(res,503,{error:'Cartesia is not configured. Add CARTESIA_API_KEY and CARTESIA_VOICE_ID to .env.'});
   const upstream=await fetch('https://api.cartesia.ai/access-token',{method:'POST',headers:{Authorization:`Bearer ${process.env.CARTESIA_API_KEY}`,'Content-Type':'application/json','Cartesia-Version':'2026-03-01'},body:JSON.stringify({grants:{tts:true,stt:false,agent:false},expires_in:600})});
   const result=await upstream.json();if(!upstream.ok){console.error('Cartesia token error',upstream.status,result);return send(res,upstream.status,{error:result.message||result.error||'Could not start Cartesia voice'});}return send(res,200,{token:result.token,voiceId:process.env.CARTESIA_VOICE_ID,model:process.env.CARTESIA_MODEL||'sonic-3.5',version:'2026-03-01'});
  }
  if(p==='/api/chat'&&m==='POST'){const b=await body(req), msg={id:id('m'),ownerId:me.id,mode:b.mode||'solo',role:'user',text:b.text,createdAt:new Date().toISOString()};d.messages.push(msg);const reply={id:id('m'),ownerId:me.id,mode:msg.mode,role:'sage',text:aiReply(b.text,msg.mode,me.name),createdAt:new Date().toISOString()};d.messages.push(reply);write(d);return send(res,200,{reply});}
  if(p==='/api/link'&&m==='POST'){const b=await body(req),other=d.users.find(x=>x.email.toLowerCase()===String(b.email).toLowerCase());if(!other||other.id===me.id)return send(res,404,{error:'No eligible account found'});if(me.partnerId||other.partnerId)return send(res,409,{error:'One of these accounts is already linked'});me.partnerId=other.id;other.partnerId=me.id;d.links.push({id:id('l'),userA:me.id,userB:other.id,status:'linked',linkedAt:new Date().toISOString()});write(d);return send(res,200,{partner:safeUser(other)});}
  if(p==='/api/unlink'&&m==='POST'){if(me.partnerId){const other=d.users.find(x=>x.id===me.partnerId);if(other)other.partnerId=null;d.links.filter(x=>x.status==='linked'&&(x.userA===me.id||x.userB===me.id)).forEach(x=>x.status='unlinked');me.partnerId=null;write(d)}return send(res,200,{ok:true});}
  const match=p.match(/^\/api\/(sessions|goals|journal)(?:\/([^/]+))?$/); if(match){let [_,kind,itemId]=match;let arr=d[kind];if(m==='POST'&&!itemId){let b=await body(req),item={...b,id:id(kind[0]),ownerId:me.id,createdAt:new Date().toISOString()};if(kind==='sessions')item.participants=b.type==='joint'&&me.partnerId?[me.id,me.partnerId]:[me.id];arr.push(item);write(d);return send(res,201,{item});}const item=arr.find(x=>x.id===itemId&&x.ownerId===me.id);if(!item)return send(res,404,{error:'Not found'});if(m==='PUT'){Object.assign(item,await body(req),{id:item.id,ownerId:item.ownerId});write(d);return send(res,200,{item});}if(m==='DELETE'){d[kind]=arr.filter(x=>x.id!==itemId);write(d);return send(res,200,{ok:true});}}
  if(p.startsWith('/api/'))return send(res,404,{error:'Not found'});
  let file=p==='/'?'index.html':p.slice(1);file=path.normalize(file).replace(/^\.\.(\/|\\)/,'');let fp=path.join(PUBLIC,file);if(!fp.startsWith(PUBLIC)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory())fp=path.join(PUBLIC,'index.html');const ext=path.extname(fp);const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};send(res,200,fs.readFileSync(fp),types[ext]||'application/octet-stream');
 }catch(e){console.error(e);send(res,500,{error:'Something went wrong'})}
});
const PORT=process.env.PORT||3000;server.listen(PORT,'0.0.0.0',()=>console.log(`Sage listening on http://0.0.0.0:${PORT}`));