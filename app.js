(function(){
"use strict";

/* ---------- config ---------- */
var SB_URL="https://gqqdbhgusdjryrbunkhj.supabase.co";
var SB_KEY="sb_publishable_uoPijcsdsorwLxDvNDHiPw_WVgGe-ni";
var LANGS={
  en:{name:"Английский",native:"English",flag:"🇬🇧",tts:"en-US",adj:"английское",adv:"по-английски",loc:"на английском",articles:/^(to|a|an|the) /},
  nl:{name:"Нидерландский",native:"Nederlands",flag:"🇳🇱",tts:"nl-NL",adj:"нидерландское",adv:"по-нидерландски",loc:"на нидерландском",articles:null}
};
var LANG_ORDER=["en","nl"];
var H=3600e3;
var INT=[4,12,24,144,288,576,1152,2304,4320].map(function(h){return h*H});
var STAGE_NAMES=["через 4 ч","через 12 ч","через 1 день","через 6 дней","через 12 дней","через 24 дня","через 48 дней","через 96 дней","через 180 дней"];
var MAX_LEARN=50,MIN_ACTIVE=5,STREAK=3,T_NEW=6,REVIEW_MISSES=2;

/* ---------- state ---------- */
var sb=null,user=null,offlineUser=false;
var lang=null,L=LANGS.en,DATA=[],BYID=new Map(),SG=[],PH=[],IPA=[],IPA_TITLE="",IPA_NOTE="";
var dataCache={};
var S=null,ui={mode:"boot"},view=document.getElementById("view");
var APP_VERSION=null,googleOn=false;

function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function lsDel(k){try{localStorage.removeItem(k)}catch(e){}}
function stateKey(){return "lexicon.p."+(user?user.id:"anon")+"."+lang}

/* ---------- progress (per user, per language) ---------- */
function blank(){return{words:{},day:"",newToday:0,credits:0,ts:0}}
function pruneStale(words){Object.keys(words).forEach(function(id){if(!BYID.has(Number(id)))delete words[id];else if(words[id].s==="L"){var w=words[id];w.t=T_NEW;if(w.c>=STREAK)w.u=1}})}
function normalize(o){
  if(!o||typeof o!=="object"||!o.words)o=blank();
  if(typeof o.credits!=="number")o.credits=0;
  if(typeof o.ts!=="number")o.ts=0;
  delete o.bks;
  pruneStale(o.words);
  return o;
}
function loadLocal(){var r=lsGet(stateKey());var o=null;try{o=r?JSON.parse(r):null}catch(e){}S=normalize(o);rollDay()}
function storeLocal(){lsSet(stateKey(),JSON.stringify(S))}
function save(){S.ts=Date.now();storeLocal();queuePush()}

/* ---------- cloud sync (Supabase table public.progress) ---------- */
var cloud={state:"local",count:0,allow:false,timer:null,busy:false,again:false,lastSync:0};
function wordCount(w){return Object.keys(w||{}).length}
function learnedCount(w){var n=0;for(var k in w)if(w[k].s==="R")n++;return n}
function canCloud(){return !!(sb&&user&&!offlineUser)}
function pullRemote(forLang){
  return sb.from("progress").select("data").eq("lang",forLang).maybeSingle().then(function(r){
    if(r.error)throw r.error;
    return r.data&&r.data.data&&r.data.data.words?r.data.data:null;
  });
}
function queuePush(){if(!canCloud())return;if(cloud.busy){cloud.again=true;return}clearTimeout(cloud.timer);cloud.timer=setTimeout(push,1200)}
function push(){
  if(!canCloud()||cloud.busy)return Promise.resolve();
  var cnt=wordCount(S.words);
  if(cloud.count>=20&&cnt<cloud.count*0.5&&!cloud.allow){cloud.state="guard";if(ui.mode==="home"||ui.mode==="stats")render();return Promise.resolve()}
  cloud.busy=true;
  var forLang=lang,snap=JSON.parse(JSON.stringify(S));
  return sb.from("progress").upsert({user_id:user.id,lang:forLang,data:snap,updated_at:new Date().toISOString()}).then(function(r){
    if(r.error)throw r.error;
    if(forLang===lang){cloud.state="cloud";cloud.count=cnt;cloud.allow=false;cloud.lastSync=Date.now()}
  }).catch(function(){if(forLang===lang)cloud.state=navigator.onLine?"error":"offline"}).then(function(){
    cloud.busy=false;if(cloud.again){cloud.again=false;queuePush()}
  });
}
function adopt(rem){
  S=normalize(JSON.parse(JSON.stringify(rem)));storeLocal();
  cloud.count=wordCount(S.words);cloud.state="cloud";cloud.allow=false;cloud.lastSync=Date.now();
  if(ui.mode==="quiz")ui={mode:"home"};
  rollDay();
}
/* pull once per language open and whenever the app comes back to the foreground */
function syncFromCloud(){
  if(!canCloud())return Promise.resolve();
  var forLang=lang;
  return pullRemote(forLang).then(function(rem){
    if(forLang!==lang)return;
    if(rem&&(rem.ts||0)>(S.ts||0)){if(ui.mode==="quiz")return;adopt(rem);render();return}
    cloud.count=rem?wordCount(rem.words):0;cloud.state="cloud";
    if(!rem||(S.ts||0)>(rem.ts||0))return push().then(function(){if(ui.mode==="home"||ui.mode==="stats")render()});
    cloud.lastSync=Date.now();
  }).catch(function(){if(forLang===lang){cloud.state=navigator.onLine?"error":"offline";if(ui.mode==="stats")render()}});
}
function syncNow(){
  var done=function(m){ui={mode:"stats",msg:m};render()};
  if(!canCloud()){done("Нет связи с сервером. Прогресс сохранён на устройстве и отправится, когда появится интернет.");return}
  ui={mode:"stats",msg:"Синхронизация…"};render();
  pullRemote(lang).then(function(rem){
    if(rem&&(rem.ts||0)>(S.ts||0)){adopt(rem);done("Загружено из облака: слов "+wordCount(S.words)+".");return}
    cloud.count=rem?wordCount(rem.words):0;
    S.ts=Date.now();storeLocal();
    return push().then(function(){
      if(cloud.state==="guard")done("Синхронизация остановлена защитой: на устройстве слов намного меньше, чем в облаке.");
      else if(cloud.state!=="cloud")done("Не удалось сохранить в облако. Попробуйте ещё раз.");
      else done("Готово, облако и устройство совпадают. Слов: "+wordCount(S.words)+", "+fmtTime(Date.now())+".");
    });
  }).catch(function(){done("Не удалось связаться с сервером. Попробуйте ещё раз.")});
}
function fmtTime(t){var d=new Date(t);return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)}
function guardHtml(){
  if(cloud.state!=="guard")return "";
  return '<div class="panel stack" style="border-color:var(--bad)"><h3>Защита прогресса</h3><p class="small" style="margin:0">На этом устройстве слов намного меньше, чем в облаке ('+wordCount(S.words)+' против '+cloud.count+'). Чтобы не потерять прогресс, сохранение в облако остановлено.</p><button class="btn primary" data-act="guard-restore">Вернуть прогресс из облака</button><button class="btn ghost" data-act="guard-force">Всё равно перезаписать облако</button></div>';
}

/* ---------- language data ---------- */
function loadLang(code){
  if(dataCache[code])return Promise.resolve(dataCache[code]);
  return fetch("data/"+code+".json").then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(function(o){dataCache[code]=o;return o});
}
function openLang(code){
  if(!LANGS[code])code="en";
  audioPause();
  if(S&&lang)storeLocal();
  ui={mode:"loading"};render();
  return loadLang(code).then(function(o){
    lang=code;L=LANGS[code];lsSet("lexicon.lang",code);
    DATA=o.dict;IPA=o.ipa;IPA_TITLE=o.ipaTitle;IPA_NOTE=o.ipaNote;
    BYID=new Map();SG=[];PH=[];
    DATA.forEach(function(d){BYID.set(d[0],d);(d[1].indexOf(" ")>=0?PH:SG).push(d[0])});
    cloud={state:canCloud()?"sync":"local",count:0,allow:false,timer:null,busy:false,again:false,lastSync:0};
    loadLocal();
    ui={mode:"home"};render();window.scrollTo(0,0);
    return syncFromCloud();
  },function(){ui={mode:"fail"};render()});
}

/* ---------- helpers ---------- */
function dayKey(){var d=new Date(Date.now()-4*H);return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate()}
function rollDay(){var k=dayKey();if(S.day!==k){S.day=k;S.newToday=0}}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function learning(){return Object.keys(S.words).filter(function(id){return S.words[id].s==="L"}).map(Number)}
function dueList(){var n=Date.now();return Object.keys(S.words).filter(function(id){var w=S.words[id];return w.s==="R"&&w.due<=n}).map(Number).sort(function(a,b){return S.words[a].due-S.words[b].due})}
function reviewList(){return Object.keys(S.words).filter(function(id){return S.words[id].s==="R"}).map(Number)}
function nextNew(n){var out=[];for(var i=0;i<DATA.length&&out.length<n;i++){if(!S.words[DATA[i][0]])out.push(DATA[i][0])}return out}
function newRoom(){var n=learning().length;return Math.max(0,Math.min(MAX_LEARN-n,Math.max(S.credits||0,MIN_ACTIVE-n)))}
function variants(ru){return String(ru).split(";").map(function(x){return x.trim().toLowerCase()}).filter(Boolean)}
function shareVariant(a,b){var va=variants(a),vb=variants(b);return va.some(function(x){return vb.indexOf(x)>=0})}
function shortRu(ru){return String(ru).split(";")[0].trim()}
/* exact to the minute below a day: rounding to whole hours made every fresh word read "4 ч" */
function fmtDur(ms){
  var m=Math.ceil(ms/60000);if(m<1)return "меньше минуты";if(m<60)return m+" мин";
  if(m<24*60){var h=Math.floor(m/60),r=m%60;return h+" ч"+(r?" "+r+" мин":"")}
  var d=Math.floor(m/1440),hh=Math.floor((m%1440)/60);return d+" дн."+(d<7&&hh?" "+hh+" ч":"")
}
var MONTHS=["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
function fmtWhen(t){
  var d=new Date(t),now=new Date(),day=function(x){return new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime()};
  var diff=Math.round((day(d)-day(now))/864e5),hm=fmtTime(t);
  if(diff===0)return "сегодня в "+hm;if(diff===1)return "завтра в "+hm;
  return d.getDate()+" "+MONTHS[d.getMonth()]+" в "+hm;
}
function upcoming(){var n=Date.now();return reviewList().filter(function(id){return S.words[id].due>n}).sort(function(a,b){return S.words[a].due-S.words[b].due})}
function speak(t){try{var u=new SpeechSynthesisUtterance(t);u.lang=L.tts;u.rate=.9;speechSynthesis.cancel();speechSynthesis.speak(u)}catch(e){}}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.random()*(i+1)|0,t=a[i];a[i]=a[j];a[j]=t}return a}
function newWord(){return{s:"L",c:0,t:T_NEW,st:0,due:0,ok:0,bad:0}}

/* ---------- pieces ---------- */
var ICON_SPK='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
function wordHead(d){return '<div class="row" style="align-items:flex-start"><div><div class="word">'+esc(d[1])+'</div><div class="ipa">'+esc(d[2])+'</div></div><button class="btn icon" data-act="speak" data-t="'+esc(d[1])+'" aria-label="Произнести">'+ICON_SPK+'</button></div>'}
function details(d){
  var h='<div class="label">Контекст использования</div><p style="margin:0">'+esc(d[4])+'</p>';
  if(d[9]&&d[9].length){
    h+='<div class="label">Синонимы</div><div class="row wrap" style="gap:8px">';
    h+=d[9].map(function(sid){var s=BYID.get(sid);return s?'<button class="btn" data-act="lookup" data-id="'+sid+'">'+esc(s[1])+'</button>':''}).join("");
    h+='</div>';
  }
  h+='<div class="label">Примеры</div>';
  h+='<div class="ex"><p class="en">'+esc(d[5])+'</p><p class="tr">'+esc(d[6])+'</p></div>';
  h+='<div class="ex"><p class="en">'+esc(d[7])+'</p><p class="tr">'+esc(d[8])+'</p></div>';
  return h;
}
function dots(w){var h='<div class="dots" aria-label="Верных ответов '+w.c+' из '+w.t+'">';for(var i=0;i<w.t;i++)h+='<i class="'+(i<w.c?"on":"")+'"></i>';return h+'</div>'}
function langSwitch(){
  return '<div class="seg" role="group" aria-label="Язык">'+LANG_ORDER.map(function(c){var x=LANGS[c];return '<button data-act="lang" data-lang="'+c+'" aria-pressed="'+(c===lang)+'">'+x.flag+' '+esc(x.native)+'</button>'}).join("")+'</div>';
}

/* ---------- auth ---------- */
var AUTH_ERR=[
  [/invalid login credentials/i,"Неверная почта или пароль."],
  [/already registered|already been registered|user_already_exists/i,"Эта почта уже зарегистрирована. Войдите с паролем."],
  [/password should be at least|weak.?password/i,"Пароль слишком короткий: нужно не меньше 6 символов."],
  [/unable to validate email|invalid.*email|email.*invalid/i,"Проверьте адрес почты."],
  [/email not confirmed/i,"Почта не подтверждена. Попросите администратора подтвердить её."],
  [/provider is not enabled|unsupported provider/i,"Вход через Google пока не настроен."],
  [/signups? not allowed|signup.*disabled/i,"Регистрация сейчас закрыта."],
  [/rate limit|too many/i,"Слишком много попыток. Подождите минуту и попробуйте снова."],
  [/failed to fetch|network|load failed/i,"Нет связи с сервером. Проверьте интернет."]
];
function authMsg(err){var m=String(err&&(err.message||err.code)||err||"");for(var i=0;i<AUTH_ERR.length;i++)if(AUTH_ERR[i][0].test(m))return AUTH_ERR[i][1];return "Не получилось: "+m}
function renderAuth(){
  var reg=ui.reg,busy=ui.busy;
  var h='<div class="stack auth"><div class="panel stack">';
  h+='<div><h2>'+(reg?"Создать аккаунт":"Вход")+'</h2><p class="lead" style="margin:0">Прогресс хранится в вашем аккаунте и доступен на любом устройстве.</p></div>';
  h+='<form id="authform" novalidate><label for="em">Почта</label><input id="em" class="field" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" value="'+esc(ui.email||"")+'" required>';
  h+='<label for="pw">Пароль'+(reg?" (не меньше 6 символов)":"")+'</label><input id="pw" class="field" type="password" autocomplete="'+(reg?"new-password":"current-password")+'" minlength="6" required>';
  h+='<div style="height:14px"></div><button class="btn primary block" type="submit"'+(busy?" disabled":"")+'>'+(busy?"Подождите…":(reg?"Зарегистрироваться":"Войти"))+'</button></form>';
  if(ui.err)h+='<p class="err" role="alert">'+esc(ui.err)+'</p>';
  if(ui.info)h+='<p class="note-ok">'+esc(ui.info)+'</p>';
  if(googleOn)h+='<div class="or">или</div><button class="btn block" data-act="google"'+(busy?" disabled":"")+'>Войти через Google</button>';
  h+='<div class="center"><button class="linkbtn" data-act="auth-toggle">'+(reg?"Уже есть аккаунт? Войти":"Нет аккаунта? Зарегистрироваться")+'</button></div>';
  if(!reg)h+='<div class="center"><button class="linkbtn" data-act="forgot">Забыли пароль?</button></div>';
  h+='</div></div>';
  view.innerHTML=h;
}
function submitAuth(){
  var em=document.getElementById("em").value.trim(),pw=document.getElementById("pw").value;
  ui.email=em;ui.err="";ui.info="";
  if(!em||em.indexOf("@")<1){ui.err="Введите адрес почты.";render();return}
  if(pw.length<6){ui.err="Пароль должен быть не короче 6 символов.";render();return}
  ui.busy=true;render();
  var p=ui.reg?sb.auth.signUp({email:em,password:pw}):sb.auth.signInWithPassword({email:em,password:pw});
  p.then(function(r){
    if(r.error)throw r.error;
    if(!r.data.session){ui.busy=false;ui.reg=false;ui.info="Аккаунт создан. Подтвердите почту по ссылке из письма, затем войдите.";render();return}
    onSignedIn(r.data.session.user);
  }).catch(function(e){ui.busy=false;ui.err=authMsg(e);render()});
}
function googleLogin(){
  ui.err="";ui.info="";ui.busy=true;render();
  /* a disabled provider would otherwise land on Supabase's raw JSON error page */
  fetch(SB_URL+"/auth/v1/settings",{headers:{apikey:SB_KEY}}).then(function(r){return r.json()}).then(function(st){
    if(!st||!st.external||!st.external.google)throw new Error("provider is not enabled");
    return sb.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+location.pathname}});
  }).then(function(r){
    if(r&&r.error)throw r.error;
  }).catch(function(e){ui.busy=false;ui.err=authMsg(e);render()});
}
function onSignedIn(u){
  if(user&&u&&user.id===u.id&&!offlineUser)return;
  user=u;offlineUser=false;
  lsSet("lexicon.lastUser",JSON.stringify({id:u.id,email:u.email||""}));
  afterUser();
}
function afterUser(){
  var saved=lsGet("lexicon.lang");
  lang=null;S=null;
  if(saved&&LANGS[saved])openLang(saved);else{ui={mode:"pick"};render()}
}
function signOut(){
  audioPause();
  var fin=function(){user=null;offlineUser=false;lang=null;S=null;lsDel("lexicon.lastUser");ui={mode:"auth"};render()};
  if(S)storeLocal();
  if(sb)sb.auth.signOut().then(fin,fin);else fin();
}

/* ---------- screens ---------- */
function renderPick(){
  var h='<div class="stack"><div><h2>Какой язык учим?</h2><p class="lead" style="margin:0">Прогресс по каждому языку хранится отдельно. Переключиться можно в любой момент на вкладке «Сегодня».</p></div>';
  LANG_ORDER.forEach(function(c){var x=LANGS[c];h+='<button class="langcard" data-act="lang" data-lang="'+c+'"><span class="flag" aria-hidden="true">'+x.flag+'</span><span><b>'+esc(x.name)+'</b><span class="muted small">'+esc(x.native)+'</span></span></button>'});
  view.innerHTML=h+'</div>';
}
function renderHome(){
  rollDay();
  var Ln=learning(),due=dueList(),room=newRoom(),R=reviewList();
  var next=null;R.forEach(function(id){var w=S.words[id];if(w.due>Date.now()&&(next===null||w.due<next))next=w.due});
  var h='<div class="stack">'+langSwitch()+guardHtml();
  h+='<div class="panel card-task"><div class="meta"><div><h3>В изучении</h3><p class="note">Нужно '+T_NEW+' верных ответов, чтобы слово считалось выученным. После '+STREAK+'-го открывается новое слово</p></div><div class="big tick">'+Ln.length+'<span class="muted" style="font-size:18px">/'+MAX_LEARN+'</span></div></div>';
  h+='<div class="meter"><i style="width:'+Math.min(100,Ln.length/MAX_LEARN*100)+'%"></i></div>';
  h+='<button class="btn primary block" data-act="practice"'+(Ln.length||room?"":" disabled")+'>Учить</button></div>';
  h+='<div class="panel card-task"><div class="meta"><div><h3>Повторение</h3><p class="note">'+(due.length?"Пора повторить, чтобы не забыть":(R.length?(next?"Ближайшее повторение через "+fmtDur(next-Date.now())+" ("+fmtWhen(next)+")"+(R.length>1?". Своё время у каждого слова — см. «Прогресс»":""):""):"Выученные слова появятся здесь"))+'</p></div><div class="big tick">'+due.length+'</div></div>';
  h+='<button class="btn primary block" data-act="review"'+(due.length?"":" disabled")+'>Повторить</button></div>';
  h+='</div>';
  view.innerHTML=h;
}

/* ---------- quiz ---------- */
function startQuiz(kind){audioPause();ui={mode:"quiz",kind:kind,recent:[],done:0,ok:0,bad:0,q:null};nextQ()}
function pickWord(){
  if(ui.kind==="review"){var d=dueList();return d.length?d[0]:null}
  var Ln=learning();if(!Ln.length)return null;
  var keep=Math.min(3,Ln.length-1),rec=ui.recent.slice(-keep);
  var c=Ln.filter(function(id){return rec.indexOf(id)<0});if(!c.length)c=Ln;
  var tot=0,ws=c.map(function(id){var w=1/(1+S.words[id].c);tot+=w;return w}),r=Math.random()*tot;
  for(var i=0;i<c.length;i++){r-=ws[i];if(r<=0)return c[i]}
  return c[c.length-1];
}
var TYPES=["en-ru","ru-en","type"];
function qType(id){
  var w=S.words[id],opts=TYPES.filter(function(t){return t!==w.lt});
  var t=opts[Math.random()*opts.length|0];w.lt=t;return t;
}
function buildOpts(id){
  var d=BYID.get(id),pool=d[1].indexOf(" ")>=0?PH:SG,opts=[id],g=0;
  if(pool.length<8)pool=DATA.map(function(x){return x[0]});
  while(opts.length<4&&g++<300){
    var r=pool[Math.random()*pool.length|0];if(opts.indexOf(r)>=0)continue;var rd=BYID.get(r);
    var bad=opts.some(function(o){var od=BYID.get(o);return od[1]===rd[1]||shareVariant(od[3],rd[3])});
    if(!bad)opts.push(r);
  }
  return shuffle(opts);
}
function nextQ(){
  if(ui.kind==="learn"&&newRoom()>0){var nn=nextNew(1);if(nn.length){ui.q={intro:nn[0]};render();window.scrollTo(0,0);return}}
  var id=pickWord();
  if(id==null){ui.q=null;render();return}
  var t=qType(id),q={id:id,type:t,answered:false};
  if(t!=="type")q.opts=buildOpts(id);
  ui.q=q;render();
}
function norm(s){return String(s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[’]/g,"'").replace(/[^a-z0-9' ]/g," ").replace(/\s+/g," ").trim()}
function lev(a,b){var m=a.length,n=b.length,p=[],i,j;for(j=0;j<=n;j++)p[j]=j;for(i=1;i<=m;i++){var prev=p[0];p[0]=i;for(j=1;j<=n;j++){var t=p[j];p[j]=Math.min(p[j]+1,p[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=t}}return p[n]}
function checkTyped(word,val){
  var a=norm(word),b=norm(val);if(!b)return 0;if(a===b)return 1;
  var st=function(x){return L.articles?x.replace(L.articles,""):x};if(st(a)===st(b))return 1;
  if(a.length>=7&&lev(st(a),st(b))<=1)return 2;return 0;
}
function answer(correct,given,note){
  var q=ui.q,w=S.words[q.id];q.answered=true;q.correct=correct;q.given=given;q.note=note||"";ui.done++;
  if(correct){
    ui.ok++;w.ok++;
    if(w.s==="L"){w.c++;if(w.c>=STREAK&&!w.u){w.u=1;S.credits++;q.unlocked=true}if(w.c>=w.t){w.s="R";w.st=0;w.m=0;w.due=Date.now()+INT[0];q.grad=true}}
    else{w.m=0;w.st=Math.min(w.st+1,8);w.due=Date.now()+INT[w.st];q.next=INT[w.st]}
  }else{
    ui.bad++;w.bad++;
    if(w.s==="L"){if(w.c>=STREAK){w.c=STREAK;q.floor=true}else{q.reset=w.c>0;w.c=0}}
    else{w.m=(w.m||0)+1;if(w.m>=REVIEW_MISSES){w.s="L";w.c=0;w.u=0;w.m=0;w.t=T_NEW;w.st=0;w.due=0;q.relapsed=true}else{w.st=0;w.due=Date.now()+INT[0];q.warned=true}}
  }
  ui.recent.push(q.id);save();render();
  if(correct)speak(BYID.get(q.id)[1]);
}
function renderQuiz(){
  var top='<div class="topbar"><button class="btn ghost" data-act="home">Завершить</button><span class="pill tick">верно '+ui.ok+' · ошибок '+ui.bad+'</span></div>';
  var q=ui.q;
  if(!q){
    var msg=ui.kind==="review"?"Все повторения на сейчас пройдены.":"Слов для тренировки больше нет.";
    view.innerHTML=top+'<div class="panel stack"><h2>Сессия окончена</h2><p class="lead" style="margin:0">'+msg+' Верных ответов: '+ui.ok+', ошибок: '+ui.bad+'.</p><button class="btn primary block" data-act="home">На главную</button></div>';return;
  }
  if(q.intro){var di=BYID.get(q.intro);view.innerHTML=top+'<div class="fb info">Открывается новое слово</div><div style="height:12px"></div><div class="panel">'+wordHead(di)+'<div class="label">Перевод</div><div class="ru">'+esc(di[3])+'</div>'+details(di)+'</div><div style="height:12px"></div><button class="btn primary block" data-act="learn-inline">Начать учить</button>';return}
  var d=BYID.get(q.id),w=S.words[q.id],h=top+'<div class="stack">';
  h+='<div class="panel prompt">';
  h+='<div class="row wrap" style="margin-bottom:10px"><span class="small muted">'+(w.s==="L"?"Изучение · "+w.c+" из "+w.t+(w.u?"":" · новое слово после "+STREAK):"Повторение"+(w.m?" · была ошибка":""))+'</span>'+(w.s==="L"?dots(w):"")+'</div>';
  if(q.type==="en-ru"){h+='<div class="small muted" style="margin-bottom:6px">Выберите перевод</div>'+wordHead(d)}
  else if(q.type==="ru-en"){h+='<div class="small muted" style="margin-bottom:6px">Выберите '+L.adj+' слово</div><div class="ru" style="font-size:24px">'+esc(d[3])+'</div>'}
  else{h+='<div class="small muted" style="margin-bottom:6px">Напишите '+L.adv+'</div><div class="ru" style="font-size:24px">'+esc(d[3])+'</div>'}
  h+='</div>';
  if(q.type!=="type"){
    h+='<div class="opts">';
    q.opts.forEach(function(id){
      var o=BYID.get(id),cls="opt",dis="";
      if(q.answered){dis=" disabled";if(id===q.id)cls+=" ok";else if(id===q.given)cls+=" bad"}
      h+='<button class="'+cls+'" data-act="pick" data-id="'+id+'"'+dis+'>'+(q.type==="en-ru"?esc(o[3]):'<span>'+esc(o[1])+'</span><span class="ipa">'+esc(o[2])+'</span>')+'</button>';
    });
    h+='</div>';
  }else if(!q.answered){
    h+='<input id="typed" class="field" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Слово '+L.adv+'"><div class="row"><button class="btn" data-act="idk">Не знаю</button><button class="btn primary" data-act="check">Проверить</button></div>';
  }
  if(q.answered){
    var okc=q.correct;
    h+='<div class="fb '+(okc?"ok":"bad")+'">'+(okc?"Верно":"Неверно")+(q.note?" — "+esc(q.note):"")
      +(q.unlocked?". "+STREAK+" верных ответа — откроется новое слово":"")+(q.floor?". Счётчик вернулся к "+STREAK:"")+(q.reset?". Счётчик сброшен до 0":"")+(q.grad?". Слово выучено, первое повторение "+STAGE_NAMES[0]:"")
      +(q.next?". Следующее повторение через "+fmtDur(q.next):"")
      +(q.warned?". Первая ошибка на повторении: при следующей ошибке подряд слово вернётся в изучение":"")+(q.relapsed?". Вторая ошибка подряд: слово вернулось в изучение, нужно "+T_NEW+" верных ответов":"")+'</div>';
    h+='<div class="panel">'+wordHead(d)+'<div class="label">Перевод</div><div class="ru">'+esc(d[3])+'</div>'+details(d)+'</div>';
    h+='<button class="btn primary block" data-act="next">Дальше</button>';
  }
  h+='</div>';
  view.innerHTML=h;
  var ti=document.getElementById("typed");if(ti){ti.focus({preventScroll:true})}
}

/* ---------- stats ---------- */
function cloudLine(){
  if(offlineUser)return "Нет связи с сервером: прогресс сохраняется на устройстве и отправится в аккаунт, когда появится интернет.";
  if(cloud.state==="cloud")return "Прогресс сохраняется в вашем аккаунте и доступен на любом устройстве"+(cloud.lastSync?" (последняя синхронизация в "+fmtTime(cloud.lastSync)+")":"")+".";
  if(cloud.state==="offline")return "Нет интернета: прогресс сохранён на устройстве и отправится в аккаунт позже.";
  if(cloud.state==="error")return "Не удалось сохранить в аккаунт, прогресс пока лежит только на этом устройстве.";
  if(cloud.state==="guard")return "Сохранение в облако остановлено защитой, см. предупреждение выше.";
  return "Синхронизация…";
}
function renderStats(){
  var Ln=learning(),R=reviewList(),due=dueList().length,stg=[];
  for(var i=0;i<9;i++)stg.push(0);R.forEach(function(id){stg[S.words[id].st]++});
  var mx=Math.max.apply(null,stg.concat([1]));
  var h='<div class="stack">'+guardHtml()+'<div class="panel"><div class="row wrap"><div><div class="big tick">'+R.length+'</div><div class="muted small">выучено из '+DATA.length+'</div></div><div><div class="big tick">'+Ln.length+'</div><div class="muted small">в изучении</div></div><div><div class="big tick">'+due+'</div><div class="muted small">к повторению</div></div></div><div class="meter" style="margin-top:14px"><i style="width:'+(R.length/Math.max(1,DATA.length)*100)+'%"></i></div></div>';
  h+='<div class="panel"><h3 style="margin-bottom:12px">Выученные по интервалам</h3><div class="bars">';
  for(var s=0;s<9;s++)h+='<div class="bar"><span class="muted">'+STAGE_NAMES[s].replace("через ","")+'</span><div class="meter"><i style="width:'+(stg[s]/mx*100)+'%"></i></div><b>'+stg[s]+'</b></div>';
  h+='</div></div>';
  var up=upcoming();
  if(up.length){
    h+='<div class="panel"><h3 style="margin-bottom:6px">Расписание повторений</h3><div class="list">';
    up.slice(0,30).forEach(function(id){var d=BYID.get(id),w=S.words[id];h+='<div class="li"><div><b>'+esc(d[1])+'</b><div class="muted small">'+esc(shortRu(d[3]))+'</div></div><div class="small" style="text-align:right">'+esc(fmtWhen(w.due))+'<div class="muted">через '+esc(fmtDur(w.due-Date.now()))+'</div></div></div>'});
    h+='</div>'+(up.length>30?'<p class="muted small" style="margin:8px 0 0">и ещё '+(up.length-30)+'</p>':'')+'</div>';
  }
  h+='<div class="panel"><h3 style="margin-bottom:6px">Сейчас в изучении</h3>';
  if(!Ln.length)h+='<p class="muted" style="margin:0">Пока нет слов. Нажмите «Учить» на главной, чтобы начать.</p>';
  else{h+='<div class="list">';Ln.forEach(function(id){var d=BYID.get(id),w=S.words[id];h+='<div class="li"><div><b>'+esc(d[1])+'</b><div class="ipa" style="font-size:14px">'+esc(d[2])+'</div><div class="muted small">'+esc(d[3])+'</div></div>'+dots(w)+'</div>'});h+='</div>'}
  h+='</div>';
  h+='<div class="panel stack"><h3>Аккаунт</h3><p class="small" style="margin:0">Вы вошли как <b>'+esc(user&&user.email||"")+'</b>.</p><p class="muted small" style="margin:0">'+esc(cloudLine())+'</p><button class="btn primary block" data-act="sync">Синхронизировать</button><button class="btn ghost" data-act="signout">Выйти из аккаунта</button></div>';
  h+='<div class="panel stack"><h3>Резервная копия</h3><p class="muted small" style="margin:0">Копию прогресса по языку «'+esc(L.name)+'» можно сохранить в заметках; чтобы восстановить, вставьте текст сюда и нажмите «Восстановить».</p><textarea id="bk" class="field" spellcheck="false" aria-label="Резервная копия"></textarea><div class="row wrap"><button class="btn" data-act="export">Показать копию</button><button class="btn" data-act="import">Восстановить</button></div><div id="bkmsg" class="small" style="color:var(--ok)">'+esc(ui.msg||"")+'</div>'+(ui.resetArm?'<div class="fb bad">Стереть весь прогресс по языку «'+esc(L.name)+'»? Это нельзя отменить.</div><div class="row"><button class="btn" data-act="reset-cancel">Отмена</button><button class="btn primary" data-act="reset">Да, стереть</button></div>':'<button class="btn ghost" data-act="reset">Стереть весь прогресс</button>')+'</div>';
  if(APP_VERSION)h+='<p class="muted small center" style="margin:0">Версия '+esc(APP_VERSION)+'</p>';
  h+='</div>';
  view.innerHTML=h;
}

/* ---------- ipa ---------- */
function renderIpa(){
  var h='<div class="stack"><div class="panel"><h3>'+esc(IPA_TITLE)+'</h3><p class="small" style="margin:8px 0 0">'+IPA_NOTE+'</p></div>';
  IPA.forEach(function(g){
    h+='<div class="panel"><h3>'+esc(g[0])+'</h3>';
    g[1].forEach(function(r){
      h+='<div class="phon-row"><span class="sym">/'+esc(r[0])+'/</span><span class="ex">'+esc(r[1])+' '+esc(r[2])+' — '+esc(r[3])+'</span><div class="desc">'+esc(r[4])+'</div></div>';
    });
    h+='</div>';
  });
  h+='</div>';
  view.innerHTML=h;
}

/* ---------- audio ---------- */
var AUDIO_GAP=900,AUDIO_NEXT=1600;
var audio={playing:false,seq:0,timer:null,order:[],idx:0,current:null,lang:null};
function audioOrder(){return shuffle(DATA.map(function(d){return d[0]}))}
function speakLang(text,code,onend){
  try{
    var u=new SpeechSynthesisUtterance(text);u.lang=code;u.rate=code==="ru-RU"?.95:.9;
    u.onend=onend;u.onerror=onend;speechSynthesis.speak(u);
  }catch(e){onend()}
}
function audioStep(seq){
  if(!audio.playing||seq!==audio.seq)return;
  if(audio.idx>=audio.order.length){audio.order=audioOrder();audio.idx=0}
  var d=BYID.get(audio.order[audio.idx++]);
  audio.current=d;if(ui.mode==="audio")render();
  speakLang(d[1],L.tts,function(){
    if(!audio.playing||seq!==audio.seq)return;
    audio.timer=setTimeout(function(){
      if(!audio.playing||seq!==audio.seq)return;
      speakLang(shortRu(d[3]),"ru-RU",function(){
        if(!audio.playing||seq!==audio.seq)return;
        audio.timer=setTimeout(function(){audioStep(seq)},AUDIO_NEXT);
      });
    },AUDIO_GAP);
  });
}
function audioPlay(){
  if(audio.playing)return;
  if(audio.lang!==lang){audio.order=[];audio.idx=0;audio.current=null;audio.lang=lang}
  audio.playing=true;audio.seq++;
  if(!audio.order.length)audio.order=audioOrder();
  audioStep(audio.seq);render();
}
function audioPause(){
  if(!audio.playing)return;
  audio.playing=false;audio.seq++;clearTimeout(audio.timer);
  try{speechSynthesis.cancel()}catch(e){}
  if(ui.mode==="audio")render();
}
function renderAudio(){
  var d=audio.lang===lang?audio.current:null,h='<div class="stack"><div class="panel" style="text-align:center;padding:36px 16px">';
  h+=d?('<div class="word">'+esc(d[1])+'</div><div class="ipa">'+esc(d[2])+'</div><div class="ru" style="margin-top:10px">'+esc(shortRu(d[3]))+'</div>'):'<p class="lead" style="margin:0">Наденьте наушники и нажмите «Играть» — слова '+L.loc+' и перевод на русском пойдут вперемешку, в случайном порядке.</p>';
  h+='</div><button class="btn primary block" data-act="'+(audio.playing?"audio-pause":"audio-play")+'">'+(audio.playing?"Пауза":"Играть")+'</button>';
  h+='<p class="muted small" style="text-align:center;margin:4px 0 0">Отдельный режим для прослушивания — без связи с прогрессом изучения.</p></div>';
  view.innerHTML=h;
}

/* ---------- lookup (opened from a synonym) ---------- */
function renderLookup(){
  var d=BYID.get(ui.id),w=S.words[ui.id];
  var addBtn=!w?'<button class="btn primary block" data-act="lookup-add" data-id="'+d[0]+'">Добавить к изучению</button>'
    :'<button class="btn block" disabled>'+(w.s==="R"?"Уже выучено":"Уже в изучении")+'</button>';
  var h='<div class="stack"><button class="btn ghost" data-act="lookup-back">← Назад</button>';
  h+='<div class="panel">'+wordHead(d)+'<div class="label">Перевод</div><div class="ru">'+esc(d[3])+'</div>'+details(d)+'</div>';
  h+=addBtn+'</div>';
  view.innerHTML=h;
}

/* ---------- routing ---------- */
var APP_MODES={home:1,stats:1,ipa:1,audio:1};
function render(){
  var inApp=!!(lang&&S&&(APP_MODES[ui.mode]||ui.mode==="quiz"||ui.mode==="lookup"));
  document.getElementById("tabs").hidden=!inApp||ui.mode==="quiz"||ui.mode==="lookup";
  Array.prototype.forEach.call(document.querySelectorAll("#tabs button"),function(b){b.setAttribute("aria-current",String(b.getAttribute("data-tab")===ui.mode))});
  document.getElementById("brandlang").textContent=inApp?" "+L.flag:"";
  document.getElementById("topinfo").textContent=inApp?DATA.length+" слов":"";
  if(ui.mode==="auth")renderAuth();
  else if(ui.mode==="pick")renderPick();
  else if(ui.mode==="loading"||ui.mode==="boot")view.innerHTML='<p class="muted">Загрузка…</p>';
  else if(ui.mode==="fail")view.innerHTML='<div class="panel stack"><h3>Не удалось загрузить словарь</h3><p class="muted small" style="margin:0">Проверьте интернет и попробуйте ещё раз.</p><button class="btn primary block" data-act="retry">Повторить</button></div>';
  else if(!inApp){ui={mode:"auth"};renderAuth()}
  else if(ui.mode==="home")renderHome();else if(ui.mode==="stats")renderStats();else if(ui.mode==="ipa")renderIpa();else if(ui.mode==="audio")renderAudio();else if(ui.mode==="quiz")renderQuiz();else if(ui.mode==="lookup")renderLookup();
}
document.getElementById("tabs").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;ui={mode:b.getAttribute("data-tab")};render();window.scrollTo(0,0)});
view.addEventListener("submit",function(e){if(e.target.id==="authform"){e.preventDefault();submitAuth()}});
view.addEventListener("click",function(e){
  var b=e.target.closest("[data-act]");if(!b)return;var a=b.getAttribute("data-act");
  if(a==="speak")speak(b.getAttribute("data-t"));
  else if(a==="lang"){var lc=b.getAttribute("data-lang");if(lc!==lang||!S)openLang(lc)}
  else if(a==="retry")openLang(lsGet("lexicon.lang")||"en");
  else if(a==="auth-toggle"){ui={mode:"auth",reg:!ui.reg,email:(document.getElementById("em")||{}).value||ui.email};render()}
  else if(a==="forgot"){ui.err="";ui.info="Пока восстановление по почте не настроено: напишите администратору приложения, он сбросит пароль.";render()}
  else if(a==="google")googleLogin();
  else if(a==="signout")signOut();
  else if(a==="home"){ui={mode:"home"};render()}
  else if(a==="learn-inline"){var iid=ui.q.intro;if(!S.words[iid]){S.words[iid]=newWord();if(S.credits>0)S.credits--;save()}nextQ()}
  else if(a==="practice")startQuiz("learn");
  else if(a==="review")startQuiz("review");
  else if(a==="audio-play")audioPlay();
  else if(a==="audio-pause")audioPause();
  else if(a==="next"){nextQ();window.scrollTo(0,0)}
  else if(a==="pick"){var id=Number(b.getAttribute("data-id"));answer(id===ui.q.id,id)}
  else if(a==="check"){doCheck()}
  else if(a==="idk"){answer(false,null)}
  else if(a==="export"){var ta=document.getElementById("bk");ta.value=JSON.stringify(S);ta.select()}
  else if(a==="import"){var bm=document.getElementById("bkmsg");try{var o=JSON.parse(document.getElementById("bk").value);if(!o||!o.words)throw 0;
      S=normalize(o);cloud.allow=true;save();rollDay();ui={mode:"stats",msg:"Прогресс восстановлен."};render()
    }catch(err){bm.textContent="Не удалось прочитать копию. Вставьте текст целиком."}}
  else if(a==="reset"){if(!ui.resetArm){ui={mode:"stats",resetArm:true};render();return}
    S=blank();S.day=dayKey();cloud.allow=true;save();ui={mode:"stats",msg:"Прогресс стёрт."};render()}
  else if(a==="reset-cancel"){ui={mode:"stats"};render()}
  else if(a==="sync")syncNow();
  else if(a==="guard-restore"){pullRemote(lang).then(function(rem){if(rem)adopt(rem);render()},function(){})}
  else if(a==="guard-force"){cloud.allow=true;cloud.state="cloud";push().then(render);render()}
  else if(a==="lookup"){var lid=Number(b.getAttribute("data-id"));ui={mode:"lookup",id:lid,back:ui};render();window.scrollTo(0,0)}
  else if(a==="lookup-back"){ui=ui.back||{mode:"home"};render();window.scrollTo(0,0)}
  else if(a==="lookup-add"){var aid=Number(b.getAttribute("data-id"));if(!S.words[aid]){S.words[aid]=newWord();if(S.credits>0)S.credits--;save()}render()}
});
view.addEventListener("input",function(e){
  if(e.target.id!=="typed"||ui.mode!=="quiz"||!ui.q||ui.q.answered||ui.q.type!=="type")return;
  var d=BYID.get(ui.q.id);if(norm(e.target.value)===norm(d[1]))answer(true,e.target.value,"");
});
function doCheck(){
  var ti=document.getElementById("typed");if(!ti||!ti.value.trim())return;
  var d=BYID.get(ui.q.id),r=checkTyped(d[1],ti.value);
  answer(r>0,ti.value,r===2?"почти, опечатка засчитана":(r===0?"вы написали: "+ti.value:""));
}
document.addEventListener("keydown",function(e){
  if(e.key!=="Enter"||ui.mode!=="quiz"||!ui.q)return;
  if(ui.q.answered){nextQ();window.scrollTo(0,0)}else if(ui.q.type==="type"){doCheck()}
});

setInterval(function(){if(document.visibilityState==="visible"&&S&&(ui.mode==="home"||(ui.mode==="stats"&&!ui.resetArm&&!document.getElementById("bk").value)))render()},60000);

/* ---------- updates: reload when a newer version is deployed ---------- */
function checkVersion(){
  return fetch("version.json",{cache:"no-store"}).then(function(r){return r.ok?r.json():null}).then(function(v){
    if(!v||!v.version)return;
    if(!APP_VERSION){APP_VERSION=v.version;return}
    if(v.version!==APP_VERSION&&ui.mode!=="quiz"&&!audio.playing){if(S)storeLocal();location.reload()}
  }).catch(function(){});
}
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState!=="visible")return;
  checkVersion();
  if(lang&&S&&ui.mode!=="quiz")syncFromCloud();
});
window.addEventListener("online",function(){
  if(offlineUser&&sb){sb.auth.getSession().then(function(r){var s=r.data&&r.data.session;if(s){offlineUser=false;user=s.user;if(lang&&S)syncFromCloud()}})}
  else if(lang&&S)queuePush();
});

/* ---------- boot ---------- */
/* show the Google button only once the provider is enabled in Supabase */
function checkProviders(){
  fetch(SB_URL+"/auth/v1/settings",{headers:{apikey:SB_KEY}}).then(function(r){return r.json()}).then(function(st){
    var on=!!(st&&st.external&&st.external.google);
    if(on!==googleOn){googleOn=on;if(ui.mode==="auth")render()}
  }).catch(function(){});
}
function boot(){
  checkVersion();checkProviders();
  if(!window.supabase||!window.supabase.createClient){bootOffline();return}
  sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  sb.auth.onAuthStateChange(function(ev,session){
    if(ev==="SIGNED_OUT"){if(user&&!offlineUser){user=null;lang=null;S=null;ui={mode:"auth"};render()}return}
    if(session&&session.user&&(ev==="SIGNED_IN"||ev==="INITIAL_SESSION"))setTimeout(function(){onSignedIn(session.user)},0);
  });
  sb.auth.getSession().then(function(r){
    var s=r.data&&r.data.session;
    if(s&&s.user){onSignedIn(s.user);return}
    if(!navigator.onLine){bootOffline();return}
    if(!user){ui={mode:"auth"};render()}
  }).catch(bootOffline);
}
/* without network the last signed-in user keeps working on the local copy */
function bootOffline(){
  var last=null;try{last=JSON.parse(lsGet("lexicon.lastUser")||"null")}catch(e){}
  if(last&&last.id){user=last;offlineUser=true;afterUser()}
  else{ui={mode:"auth",err:"Нет связи с сервером. Для первого входа нужен интернет."};render()}
}
boot();
})();
