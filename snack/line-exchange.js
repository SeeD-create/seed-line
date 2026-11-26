'use strict';
(() => {
  const API='https://script.google.com/macros/s/AKfycbztDdOm_W6RlbxVj-TfG7zxjxhspaTkaGoDvY2qqy8o_enAMRWbtQi9RGNRyndZNLfE/exec';
  const BASE='https://seed-create.github.io/seed-line/snack/';
  const $=id=>document.getElementById(id);
  let token='',ticket='',accountKey='',busy=false,config=null;
  const store={get(k){try{return localStorage.getItem(k)||'';}catch(e){return '';}},
    set(k,v){try{localStorage.setItem(k,v);return localStorage.getItem(k)===v;}catch(e){return false;}},
    remove(k){try{localStorage.removeItem(k);}catch(e){}}};
  function reward(){return new URL(location.href).searchParams.get('reward')||'';}
  function key(){return 'seedSnackLinePending:'+accountKey+':'+reward();}
  function msg(text){$('message').textContent=text||'';}
  function controls(){ $('exchange').disabled=busy||$('exchange').dataset.insufficient==='yes';$('retry').disabled=busy; }
  async function rpc(action,...args){
    const r=await fetch(API,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',
      headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({snackAction:action,args})});
    if(!r.ok)throw Error('通信を確認できませんでした。もう一度お試しください。');return r.json();
  }
  function error(r){
    $('confirm').hidden=true;msg(r.message||'確認できませんでした。もう一度お試しください。');
    $('retry').hidden=false;$('help').hidden=r.code!=='LINE_STUDENT';
  }
  function sdk(){return new Promise((resolve,reject)=>{
    if(window.liff){resolve();return;}
    const s=document.createElement('script');s.src='https://static.line-scdn.net/liff/edge/2/sdk.js';
    s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('LINEを読み込めませんでした。もう一度お試しください。'));};document.head.appendChild(s);
  });}
  function showQuote(q){
    ticket=q.ticket;$('confirm').hidden=false;$('complete').hidden=true;$('help').hidden=true;$('retry').hidden=true;
    $('student').textContent=q.name+'さん';$('price').textContent=q.points+' pt';$('reward').textContent=q.rewardName;
    $('balance').textContent='現在の残高：'+q.balance+'ポイント';
    $('exchange').dataset.insufficient=q.balance<q.points?'yes':'no';
    msg(q.balance<q.points?'ポイントが足りません。':'この内容で交換しますか？');
  }
  function done(r){
    store.remove(key());ticket='';$('heading').textContent='交換完了！';$('confirm').hidden=true;$('retry').hidden=true;
    $('complete').hidden=false;document.body.classList.add('done');msg('');
    $('result').textContent=r.rewardName+'\n'+r.usedPoints+'ポイント使いました\n残り '+r.remaining+'ポイント\n\n'+r.when+'\n受付 '+r.receipt.slice(0,8);
  }
  async function sendExchange(){
    // Persist the SAME ticket before a request. Reopening authenticates LINE
    // again, then checks only that account's pending receipt, never another's.
    const saved=store.set(key(),ticket);
    msg('交換を確認しています。画面を閉じずにお待ちください。'+(saved?'':'\nこの端末では結果待ちを保存できません。この画面のまま確認してください。'));
    try {
      const r=await rpc('snackRedeem',token,ticket);
      if(r.success){done(r);return;}
      if(!['RETRY','LOGIN'].includes(r.code))store.remove(key());
      error(r);if(r.code==='LOGIN')msg('LINEの確認が必要です。「もう一度確認する」を押してください。');
    }catch(ignore){msg('結果を確認できませんでした。「もう一度確認する」で同じ交換の結果を確認できます。');$('retry').hidden=false;}
  }
  async function start(){
    if(busy)return;busy=true;controls();$('retry').hidden=true;$('help').hidden=true;msg('LINEのログインを確認しています…');
    try {
      if(!config){const r=await fetch(API+'?action=snack_config',{credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error();config=await r.json();}
      if(!config.success||!config.lineReady||!/^\d+-[A-Za-z0-9_-]+$/.test(config.liffId)){
        config=null;error({code:'SETUP',message:'LINEでのポイント交換は準備中です。先生にお知らせください。'});return;
      }
      await sdk();await liff.init({liffId:config.liffId});
      const id=reward();if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)){error({message:'交換したいもののQRコードを読み込んでください。'});return;}
      if(!liff.isLoggedIn()){
        const p=new URL(location.href).searchParams;
        if(!p.has('lineEntry')){
          location.replace('https://liff.line.me/'+config.liffId+'/?reward='+encodeURIComponent(id)+'&lineEntry=1');return;
        }
        liff.login({redirectUri:BASE+'?reward='+encodeURIComponent(id)+'&lineEntry=1'});return;
      }
      const idToken=liff.getIDToken();if(!idToken){error({code:'AUTH',message:'LINEの本人確認が必要です。LINEからQRを読み取ってください。'});return;}
      const r=await rpc('snackLineLogin',idToken,id);
      if(!r.success){error(r);if(r.code==='AUTH')liff.logout();return;}
      token=r.token;accountKey=r.accountKey;
      const pending=store.get(key());
      if(pending){ticket=pending;await sendExchange();}else showQuote(r.quote);
    }catch(ignore){msg('LINEとの通信を確認できませんでした。もう一度お試しください。');$('retry').hidden=false;}
    finally{busy=false;controls();}
  }
  $('exchange').onclick=async()=>{
    if(busy||!ticket||!token)return;busy=true;controls();$('retry').hidden=true;
    try{await sendExchange();}finally{busy=false;controls();}
  };
  $('retry').onclick=start;
  // Legacy password tokens are intentionally never used as LINE authentication.
  start();
})();
