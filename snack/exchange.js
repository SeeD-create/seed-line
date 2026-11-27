'use strict';
(() => {
  const API='https://script.google.com/macros/s/AKfycbztDdOm_W6RlbxVj-TfG7zxjxhspaTkaGoDvY2qqy8o_enAMRWbtQi9RGNRyndZNLfE/exec';
  const BASE='https://seed-create.github.io/seed-line/snack/';
  // Public LIFF application ID. Removing the separate GAS configuration fetch
  // saves a server round trip on every opening. The backend still checks it.
  const LIFF_ID='2012816282-s46Vv1A4';
  const $=id=>document.getElementById(id);
  let token='',account='',ticket='',quote=null,pending=null,busy=false,ticker=null;
  const store={get(k){try{return localStorage.getItem(k)||'';}catch(e){return '';}},set(k,v){try{localStorage.setItem(k,v);return localStorage.getItem(k)===v;}catch(e){return false;}},remove(k){try{localStorage.removeItem(k);}catch(e){}}};
  const reward=()=>new URL(location.href).searchParams.get('reward')||'';
  const key=()=> 'seedSnackLinePending:'+account+':'+reward();
  function readPending(){const value=store.get(key());if(!value)return null;try{const p=JSON.parse(value);return p&&typeof p.ticket==='string'?p:null;}catch(ignore){return {ticket:value};}}
  function phase(value,title,detail){
    clearInterval(ticker);ticker=null;document.body.dataset.phase=value;$('heading').textContent=title;$('detail').textContent=detail||'';
    $('badgeText').textContent=({auth:'本人確認中',ready:'未交換',sending:'処理中',uncertain:'結果の確認が必要',done:'交換済み',error:'確認できません'})[value];
    const waiting=value==='auth'||value==='sending';$('spinner').hidden=!waiting;$('elapsed').hidden=!waiting;
    $('panel').setAttribute('aria-busy',String(waiting));
    if(waiting){const start=Date.now();$('elapsed').textContent='';ticker=setInterval(()=>{const sec=Math.floor((Date.now()-start)/1000);$('elapsed').textContent=sec>=3?sec+'秒経過しています':'';if(sec>=8)$('detail').textContent=value==='sending'?'記録の確認に時間がかかっています。もう一度QRを読み取らず、この画面でお待ちください。':'LINEの確認に時間がかかっています。この画面でお待ちください。';},1000);}
  }
  function controls(){ $('exchange').disabled=busy||!!(quote&&quote.balance<quote.points);$('retry').disabled=busy; }
  function hideSections(){for(const id of ['confirm','complete','help','retry'])$(id).hidden=true;}
  async function bounded(url,options={},ms=20000){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);
    try{const r=await fetch(url,{...options,signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error('network');return await r.json();}finally{clearTimeout(timer);}
  }
  const rpc=(action,...args)=>bounded(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({snackAction:action,args})});
  function initLiff(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('LINE timeout')),15000);Promise.resolve().then(()=>liff.init({liffId:LIFF_ID})).then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});}
  async function sdk(){
    if(window.liff)return;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');const timer=setTimeout(()=>{s.remove();reject(Error('sdk timeout'));},12000);s.src='https://static.line-scdn.net/liff/edge/2/sdk.js';s.onload=()=>{clearTimeout(timer);resolve();};s.onerror=()=>{clearTimeout(timer);s.remove();reject(Error('sdk'));};document.head.appendChild(s);});
  }
  function showError(message,code){
    hideSections();phase('error',code==='LINE_STUDENT'?'生徒のログインを確認してください':'画面を確認できませんでした',message);
    $('retry').textContent='もう一度読み込む';$('retry').hidden=false;$('help').hidden=code!=='LINE_STUDENT';
  }
  function uncertain(){
    hideSections();phase('uncertain','まだ交換結果を確認できません','ポイントが引かれている可能性があります。下のボタンで同じ交換の結果を確認してください。');
    $('retry').textContent='同じ交換の結果を確認する';$('retry').hidden=false;
  }
  function showQuote(q){
    quote=q;ticket=q.ticket;hideSections();phase('ready',q.points+'ポイントの交換','まだポイントは減っていません。下のボタンを押すと交換が確定します。');
    $('student').textContent=q.name+'さん';$('cost').textContent=q.points;$('reward').textContent=q.rewardName;
    $('before').textContent=q.balance;$('after').textContent=q.balance>=q.points?q.balance-q.points:'—';
    $('exchange').textContent=q.points+'ポイントで交換する';$('insufficient').hidden=q.balance>=q.points;
    $('confirm').hidden=false;
  }
  function showDone(r){
    if(typeof r.receipt!=='string'||!r.receipt||!Number.isSafeInteger(r.usedPoints)||r.usedPoints<=0||!Number.isSafeInteger(r.remaining)||r.remaining<0){uncertain();return;}
    store.remove(key());pending=null;ticket='';hideSections();phase('done','交換できました','ポイントの引き落としを記録しました。');
    $('used').textContent=r.usedPoints+'ポイント引きました';$('doneBefore').textContent=Number.isFinite(r.beforeBalance)?r.beforeBalance:r.remaining+r.usedPoints;
    $('doneAfter').textContent=r.remaining;$('doneReward').textContent=r.rewardName;
    $('receipt').textContent=String(r.when||'')+'\n受付番号 '+r.receipt.slice(0,8);$('complete').hidden=false;
  }
  async function sendSameExchange(){
    if(!pending||!pending.ticket||!token){uncertain();return;}
    hideSections();phase('sending','交換を記録しています','画面を閉じずにお待ちください。ポイントを二重に引かないよう確認しています。');
    try{
      const r=await rpc('snackRedeem',token,pending.ticket);
      if(r.success){showDone(r);return;}
      if(r.code==='LOGIN'){token='';uncertain();return;}
      if(r.code==='RETRY'){uncertain();return;}
      // A definitive rejection under the server lock made no new exchange.
      store.remove(key());pending=null;showError(r.message||'交換を確定できませんでした。もう一度内容を確認してください。',r.code);
    }catch(ignore){uncertain();}
  }
  async function start(){
    if(busy)return;busy=true;controls();hideSections();phase('auth','LINEで本人を確認しています','確認が終わると、名前と交換後のポイントが表示されます。');
    try{
      await sdk();await initLiff();const id=reward();
      if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)){showError('交換したいものに付いているQRコードを読み込んでください。');return;}
      if(!liff.isLoggedIn()){
        if(!new URL(location.href).searchParams.has('lineEntry')){location.replace('https://liff.line.me/'+LIFF_ID+'/?reward='+encodeURIComponent(id)+'&lineEntry=1');return;}
        liff.login({redirectUri:BASE+'?reward='+encodeURIComponent(id)+'&lineEntry=1'});return;
      }
      const idToken=liff.getIDToken();if(!idToken){showError('LINEからQRを読み取って、本人確認をお願いします。','AUTH');return;}
      const r=await rpc('snackLineLogin',idToken,id);
      if(!r.success){showError(r.message,r.code);if(r.code==='AUTH')liff.logout();return;}
      token=r.token;account=r.accountKey;pending=readPending();
      if(pending){await sendSameExchange();}else showQuote(r.quote);
    }catch(ignore){if(pending)uncertain();else showError('通信に時間がかかっているか、接続を確認できませんでした。下のボタンでもう一度確認できます。');}
    finally{busy=false;controls();}
  }
  $('exchange').onclick=async()=>{
    if(busy||!token||!ticket||!quote||quote.balance<quote.points)return;
    busy=true;controls();pending={ticket,points:quote.points,before:quote.balance};
    const saved=store.set(key(),JSON.stringify(pending));
    if(!saved){pending=null;busy=false;controls();showError('この端末に交換の受付番号を保存できません。LINEのブラウザで開き直してから交換してください。');return;}
    try{await sendSameExchange();}finally{busy=false;controls();}
  };
  $('retry').onclick=async()=>{
    if(busy)return;
    if(pending&&token){busy=true;controls();try{await sendSameExchange();}finally{busy=false;controls();}}
    else await start();
  };
  start();
})();
