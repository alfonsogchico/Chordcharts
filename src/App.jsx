// -------------- App.jsx (versión original + 2 fixes) --------------
//  Fix 1 → const appId  (Firebase rutas)
//  Fix 2 → barras inicio/fin en ChordChart (|, |:, :|, ||)
//------------------------------------------------------------------
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, doc, setDoc, getDoc, collection,
  getDocs, query, orderBy
} from 'firebase/firestore';
import {
  ChevronUp, ChevronDown, Save, Music4, Trash2, Copy, PlusCircle,
  Undo2, Redo2, Tally3, Tally4, X, Scissors, ClipboardPaste,
  FileDown, FolderOpen, Loader2
} from 'lucide-react';

// ---------------------------------------------------------------
// 🔧 FIX 1 ▸ appId para rutas Firestore
// ---------------------------------------------------------------
const appId = 'chordcharts';

// --- Firebase Configuration & Initialization -------------------
let app, auth, db;
try {
  const firebaseConfig = typeof __firebase_config !== 'undefined'
    ? JSON.parse(__firebase_config) : {};
  if (firebaseConfig && Object.keys(firebaseConfig).length) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } else {
    console.error('Firebase configuration missing!');
  }
} catch (e) { console.error('Firebase init error', e); }

// ------------- Music‑theory helpers (sin cambios) --------------
const NOTES_SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTES_FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const MAJOR_KEYS_CHROMATIC = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const MINOR_KEYS_CHROMATIC = ['Am','Bbm','Bm','Cm','C#m','Dm','Ebm','Em','Fm','F#m','Gm','G#m'];
const idx = (n)=>NOTES_SHARP.includes(n)?NOTES_SHARP.indexOf(n):NOTES_FLAT.indexOf(n);
const name=(i,s)=>(s?NOTES_SHARP:NOTES_FLAT)[((i%12)+12)%12];
const useSharp = (k)=>{ const r=k.replace('m',''); const flats=['F','Bb','Eb','Ab','Db','Gb','Cb']; if(flats.includes(r))return false; if(k.endsWith('m')){ if(flats.includes(name(idx(r)+3))) return false; } return true; };
const getDiatonicChords=(key,mode,q)=>{ const k=idx(key); if(k<0)return[]; const s=useSharp(key);
  const qa= mode==='major'
    ? (q==='tetrad'
        ?[{q:'maj7',i:0},{q:'m7',i:2},{q:'m7',i:4},{q:'maj7',i:5},{q:'7',i:7},{q:'m7',i:9}]
        :[{q:'',i:0},{q:'m',i:2},{q:'m',i:4},{q:'',i:5},{q:'7',i:7},{q:'m',i:9}])
    : (q==='tetrad'
        ?[{q:'m7',i:0},{q:'m7b5',i:2},{q:'maj7',i:3},{q:'m7',i:5},{q:'7',i:7},{q:'maj7',i:8},{q:'7',i:10}]
        :[{q:'m',i:0},{q:'dim',i:2},{q:'',i:3},{q:'m',i:5},{q:'',i:7},{q:'',i:8},{q:'',i:10}]);
  return qa.map(c=>name(k+c.i,s)+c.q);
};
const getOtherChords=(key,mode='major',q='tetrad')=>{ const k=idx(key); if(k<0)return[]; const s=useSharp(key); const arr=[]; const sec = mode==='major'?[2,4,7,9]:[5,7];
  sec.forEach(st=>arr.push(name(k+st+7,s)+(q==='tetrad'?'7':'')));
  if(mode==='major'){
     arr.push(name(k+5,s)+(q==='tetrad'?'m7':'m'));
     arr.push(name(k+8,false)+(q==='tetrad'?'maj7':''));
     arr.push(name(k+10,false)+(q==='tetrad'?'7':''));
  }
  return [...new Set(arr)];
};
const transposeChord=(c,s,nk)=> c==='%'?c:c.split('/').map(p=>{
  const m=p.match(/^[A-G][#b]?/); if(!m) return p; const root=m[0]; const qual=p.slice(root.length); const i=idx(root); if(i<0)return p; return name(i+s,useSharp(nk))+qual;
}).join('/');

// ---------------- History hook (sin cambios) --------------------
const useHistoryState=init=>{ const[hist,setHist]=useState([init]); const[idx,setIdx]=useState(0); const state=hist[idx];
  const setState=useCallback((a,ov=false)=>{ setHist(h=>{ const cur=h[idx]; const next=typeof a==='function'?a(cur):a; if(JSON.stringify(cur)===JSON.stringify(next)) return h;
      if(ov){ const nh=[...h]; nh[idx]=next; return nh; }
      const nh=h.slice(0,idx+1); setIdx(nh.length); return [...nh,next]; }); },[idx]);
  return [state,setState,()=>idx>0&&setIdx(idx-1),()=>idx<hist.length-1&&setIdx(idx+1),idx>0,idx<hist.length-1,(s)=>{setHist([s]);setIdx(0);}]; };

//------------------------------------------------------------------
export default function App(){
  const[userId,setUserId]=useState(null);
  const[authReady,setAuthReady]=useState(false);
  const[chart,setChart,undo,redo,canUndo,canRedo,resetHist]=useHistoryState({
    id:`chart-${Date.now()}`,title:'Mi Partitura',artist:'Anónimo',key:'C',mode:'major',savedAt:null,
    sections:[{id:Date.now(),name:'Intro',measures:[{id:1,chords:['C']},{id:2,chords:['G'],startRepeat:true},{id:3,chords:['Am']},{id:4,chords:['F'],endRepeat:':|x2'}]}]
  });
  const[selection,setSelection]=useState({start:null,end:null,activeSectionId:chart.sections[0].id});
  const[clipboard,setClipboard]=useState([]);
  const[isSaving,setIsSaving]=useState(false);

  // --- Auth ------------------------------------------------------
  useEffect(()=>{ if(!auth){setAuthReady(true);return;} onAuthStateChanged(auth,u=>{ if(u) setUserId(u.uid); else signInAnonymously(auth); setAuthReady(true); }); },[]);

  // --- Firestore save -------------------------------------------
  const saveChart=async()=>{
    if(!userId||!db||isSaving) return; setIsSaving(true);
    try{ const ref=doc(db,`artifacts/${appId}/users/${userId}/charts`,chart.id);
      await setDoc(ref,{...chart,sections:JSON.stringify(chart.sections),savedAt:new Date().toISOString()});
      alert('Guardado ✔');
    }catch(e){ console.error(e); alert('Error al guardar'); }
    finally{ setIsSaving(false); }
  };

  // --------------------------------------------------------------
  const clearSel=()=>setSelection(s=>({...s,start:null,end:null}));
  const setActiveSection=id=>setSelection({start:null,end:null,activeSectionId:id});
  const handleMeasureClick=(e,sId,mIdx)=>{ e.stopPropagation(); if(e.shiftKey&&selection.start){ if(selection.start.sectionId!==sId) return; setSelection({start:selection.start,end:{sectionId:sId,measureIndex:mIdx},activeSectionId:sId}); }
    else { setSelection({start:{sectionId:sId,measureIndex:mIdx},end:null,activeSectionId:sId}); }};

  // ---------------- TopBar (sin cambios visuales) ---------------
  const TopBar=()=>(
    <header className="bg-gray-800 text-white p-3 shadow-md fixed top-0 left-0 right-0 z-20 flex justify-between items-center">
      <div className="flex items-center gap-3"><Music4 className="h-8 w-8 text-blue-400"/><div><h1 className="font-bold">{chart.title}</h1><p className="text-sm text-gray-400">{chart.artist}</p></div></div>
      <div className="flex items-center gap-2">
        <button onClick={()=>setChart(c=>({...c,key:MAJOR_KEYS_CHROMATIC[(MAJOR_KEYS_CHROMATIC.indexOf(c.key)+11)%12]}))} className="p-1 bg-gray-700 rounded-full"><ChevronDown size={16}/></button>
        <button onClick={()=>setChart(c=>({...c,key:MAJOR_KEYS_CHROMATIC[(MAJOR_KEYS_CHROMATIC.indexOf(c.key)+1)%12]}))} className="p-1 bg-gray-700 rounded-full"><ChevronUp size={16}/></button>
        <button onClick={saveChart} disabled={isSaving} className="p-2 bg-blue-600 rounded-full disabled:opacity-50">{isSaving?<Loader2 className="animate-spin" size={18}/>:<Save size={18}/>}</button>
      </div>
    </header>
  );

  // --------------------------------------------------------------
  // 🔧 FIX 2 ▸ barras inicio / fin (| |: :| ||) -------------------
  // --------------------------------------------------------------
  const ChordChart=()=>(
    <main className="pt-24 pb-40 px-2 md:px-4 bg-gray-100 min-h-screen" onClick={clearSel}>
      <div className="max-w-4xl mx-auto space-y-4">
        {chart.sections.map((section,si)=>(
          <div key={section.id} className={`p-3 rounded-lg border ${selection.activeSectionId===section.id&&!selection.start?'bg-blue-50 ring-2 ring-blue-300':'bg-white'}`} onClick={e=>{e.stop
