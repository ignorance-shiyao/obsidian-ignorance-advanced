/** Included as source in standalone exports; it has no dependency on plugin runtime helpers. */
export function readerUrlPreferencesScript() {
  return `(()=>{
    const memory=new Map();
    const enabled=window.top===window&&location.protocol!=='about:';
    const prefix='ib-reader?';
    const valid=(key,value)=>key==='theme'?['light','dark'].includes(value):key==='width'?['narrow','standard','wide','full'].includes(value):false;
    const read=()=>{
      if(!enabled)return new URLSearchParams();
      const raw=location.hash.slice(1);
      if(raw.startsWith(prefix))return new URLSearchParams(raw.slice(prefix.length));
      const params=new URLSearchParams();
      if(raw){let anchor=raw;try{anchor=decodeURIComponent(raw);}catch(_){}params.set('anchor',anchor);}
      return params;
    };
    const write=params=>{
      if(!enabled)return;
      const clean=new URLSearchParams();
      for(const key of ['theme','width'])if(valid(key,params.get(key)))clean.set(key,params.get(key));
      if(params.get('anchor'))clean.set('anchor',params.get('anchor'));
      const hash='#'+prefix+clean.toString();
      if(clean.get('anchor')){try{history.scrollRestoration='manual';}catch(_){}}
      try{history.replaceState(history.state,'',location.href.split('#')[0]+hash);}
      catch(_){try{location.hash=hash;}catch(_){}}
    };
    return {
      get(key){if(!enabled||!['theme','width'].includes(key))return memory.get(key)||null;const value=read().get(key);return valid(key,value)?value:null;},
      set(key,value){if(!enabled||!['theme','width'].includes(key)){memory.set(key,value);return;}if(valid(key,value)){const params=read();params.set(key,value);write(params);}},
      anchor(){return read().get('anchor')||'';},
      setAnchor(value){const params=read();params.set('anchor',value);write(params);}
    };
  })()`;
}

/** Runs before the reader markup is painted, including the browser's own scroll restoration. */
export function readerEarlyScript(inHead = false) {
  return `(function(){const shell=${inHead ? "document.documentElement" : "document.currentScript.parentElement"};let mode=shell.dataset.${inHead ? "ibTheme" : "theme"};const raw=location.hash.slice(1);if(window.top===window&&raw.startsWith('ib-reader?')){const params=new URLSearchParams(raw.slice(10));const saved=params.get('theme');if(saved==='light'||saved==='dark')mode=saved;if(params.get('anchor')){try{history.scrollRestoration='manual';}catch(_){}}}shell.dataset.${inHead ? "ibTheme" : "theme"}=mode;document.documentElement.dataset.ibTheme=mode;})()`;
}

/** Reapply after load: native restoration and images can move the page after the first frame. */
export function readerAnchorRestoreScript() {
  return `let pendingAnchor=store.anchor(),restorePending=Boolean(pendingAnchor);
    const restoreAnchor=()=>{if(!restorePending)return;const target=document.getElementById(pendingAnchor);if(target){try{history.scrollRestoration='manual';}catch(_){}target.scrollIntoView({block:'start',behavior:'instant'});measure();update();}};
    const settleAnchor=()=>{restoreAnchor();requestAnimationFrame(()=>{restoreAnchor();restorePending=false;restoringAnchor=false;});};
    const cancelRestore=()=>{restorePending=false;restoringAnchor=false;};
    for(const type of ['wheel','touchstart','pointerdown','keydown'])addEventListener(type,cancelRestore,{passive:true});
    addEventListener('load',settleAnchor,{once:true});
    addEventListener('hashchange',()=>{shell.dataset.theme=store.get('theme')||exportedTheme;syncRoot();applyWidth(store.get('width')||exportedWidth);pendingAnchor=store.anchor();restorePending=Boolean(pendingAnchor);restoringAnchor=restorePending;settleAnchor();});
    requestAnimationFrame(()=>{restoreAnchor();if(document.readyState==='complete')settleAnchor();});`;
}
