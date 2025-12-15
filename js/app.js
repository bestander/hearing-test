// Simple kids hearing test prototype
// - 20-word dictionary with placeholders
// - Plays one word panned left or right at a certain gain level
// - Shows 4 choices (images + words), only one is spoken
// - 5s to answer, records responses and computes a score 1-100 per ear

const DICTIONARY = [
  {id:'cat', word:'Cat', img:'assets/img/cat.svg', audio:'assets/audio/cat.wav'},
  {id:'dog', word:'Dog', img:'assets/img/dog.svg', audio:'assets/audio/dog.wav'},
  {id:'ball', word:'Ball', img:'assets/img/ball.svg', audio:'assets/audio/ball.wav'},
  {id:'milk', word:'Milk', img:'assets/img/milk.svg', audio:'assets/audio/milk.wav'},
  {id:'cow', word:'Cow', img:'assets/img/cow.svg', audio:'assets/audio/cow.wav'},
  {id:'duck', word:'Duck', img:'assets/img/duck.svg', audio:'assets/audio/duck.wav'},
  {id:'car', word:'Car', img:'assets/img/car.svg', audio:'assets/audio/car.wav'},
  {id:'tree', word:'Tree', img:'assets/img/tree.svg', audio:'assets/audio/tree.wav'},
  {id:'fish', word:'Fish', img:'assets/img/fish.svg', audio:'assets/audio/fish.wav'},
  {id:'bird', word:'Bird', img:'assets/img/bird.svg', audio:'assets/audio/bird.wav'},
  {id:'shoe', word:'Shoe', img:'assets/img/shoe.svg', audio:'assets/audio/shoe.wav'},
  {id:'hat', word:'Hat', img:'assets/img/hat.svg', audio:'assets/audio/hat.wav'},
  {id:'book', word:'Book', img:'assets/img/book.svg', audio:'assets/audio/book.wav'},
  {id:'cup', word:'Cup', img:'assets/img/cup.svg', audio:'assets/audio/cup.wav'},
  {id:'egg', word:'Egg', img:'assets/img/egg.svg', audio:'assets/audio/egg.wav'},
  {id:'star', word:'Star', img:'assets/img/star.svg', audio:'assets/audio/star.wav'},
  {id:'apple', word:'Apple', img:'assets/img/apple.svg', audio:'assets/audio/apple.wav'},
  {id:'banana', word:'Banana', img:'assets/img/banana.svg', audio:'assets/audio/banana.wav'},
  {id:'chair', word:'Chair', img:'assets/img/chair.svg', audio:'assets/audio/chair.wav'},
  {id:'bed', word:'Bed', img:'assets/img/bed.svg', audio:'assets/audio/bed.wav'},
];

const ctx = new (window.AudioContext || window.webkitAudioContext)();

// meSpeak and client-side eSpeak have been removed from the runtime.
// Instead we preload per-word audio buffers (from `assets/audio/` if present)
// or generate synthetic demo buffers so playback is always routed through
// the WebAudio `playBuffer()` path and can be panned and gain-controlled.

// meSpeak removed: rely on browser SpeechSynthesis for TTS

// Use browser TTS for spoken words. If false, uses preloaded buffers or generated tones.
const USE_TTS = true;

const state = {
  trials: [],
  currentTrial: 0,
  maxTrials: 20,
  results: {left:[], right:[]},
  // Staircase per ear
  stair: {
    left: {level:70, step:8, minStep:1, lastDirection:null, reversals:[], history:[], done:false, reversalTarget:6},
    right: {level:70, step:8, minStep:1, lastDirection:null, reversals:[], history:[], done:false, reversalTarget:6}
  }
};

// UI elements
const startBtn = document.getElementById('start-btn');
const ttsTestBtn = document.getElementById('tts-test-btn');
const restartBtn = document.getElementById('restart-btn');
const startScreen = document.getElementById('start-screen');
const trialScreen = document.getElementById('trial-screen');
const resultsScreen = document.getElementById('results-screen');
const choicesEl = document.getElementById('choices');
const timerEl = document.getElementById('timer');
const trialCountEl = document.getElementById('trial-count');

let trialTimer = null;
let trialEndTime = 0;
let awaitingAnswer = false;
// track last trial meta for response handling
let lastTargetId = null;
let lastTrialEar = null;

startBtn.addEventListener('click', () => {
  // resume audio context on user gesture to satisfy autoplay policies
  (async ()=>{
    try{ if(ctx.state === 'suspended') await ctx.resume(); }catch(e){}
    startScreen.classList.add('hidden');
    trialScreen.classList.remove('hidden');
    startTest();
  })();
});

ttsTestBtn && ttsTestBtn.addEventListener('click', ()=>{
  // Speak a low-volume then high-volume phrase so user can compare
  try{
  const low = new SpeechSynthesisUtterance('This is low volume');
  low.volume = 0.02;
    low.rate = 0.9;
    const high = new SpeechSynthesisUtterance('This is high volume');
    high.volume = 1.0;
    high.rate = 0.9;
    speechSynthesis.speak(low);
    // speak high after low finishes
    low.onend = ()=> speechSynthesis.speak(high);
  }catch(e){
    console.warn('TTS test failed', e);
  }
});

// Operator-level gain removed; overall gain is controlled by level -> gain mapping

restartBtn && restartBtn.addEventListener('click', () => location.reload());

function startTest(){
  state.trials = buildTrials(state.maxTrials);
  state.currentTrial = 0;
  state.results = {left:[], right:[]};
  // If using TTS we don't need to preload audio files; otherwise preload buffers
  // Preload per-word audio buffers (from assets/audio/*.wav/.mp3) or generate
  // demo buffers so playback always goes through WebAudio for panning/gain.
  preloadAudioBuffers().then(()=> nextTrial());
}

function buildTrials(n){
  const arr = [];
  for(let i=0;i<n;i++){
    // pick a target word and 3 distractors
    const targetIndex = Math.floor(Math.random()*DICTIONARY.length);
    const target = DICTIONARY[targetIndex];
    const options = [target];
    while(options.length<4){
      const cand = DICTIONARY[Math.floor(Math.random()*DICTIONARY.length)];
      if(!options.find(o=>o.id===cand.id)) options.push(cand);
    }
    shuffle(options);
    const ear = Math.random()<0.5? 'left' : 'right';
    arr.push({target, options, ear});
  }
  return arr;
}

async function nextTrial(){
  // stop if both staircases are done or maxTrials reached
  const leftDone = state.stair.left.done;
  const rightDone = state.stair.right.done;
  if((leftDone && rightDone) || state.currentTrial >= state.maxTrials){
    return finishTest();
  }

  // pick ear for this trial: prefer ear that is not done and try to balance (alternate)
  const ear = (state.currentTrial % 2 === 0) ? 'left' : 'right';
  if(state.stair[ear].done){
    // if chosen ear done, use the other
    if(!state.stair[ear==='left'?'right':'left'].done) {
      chosenEar = ear==='left'?'right':'left';
    } else {
      return finishTest();
    }
  }
  const chosenEar = ear;
  lastTrialEar = chosenEar;

  // create a trial: choose target and options dynamically
  const targetIndex = Math.floor(Math.random()*DICTIONARY.length);
  const target = DICTIONARY[targetIndex];
  const options = [target];
  while(options.length<4){
    const cand = DICTIONARY[Math.floor(Math.random()*DICTIONARY.length)];
    if(!options.find(o=>o.id===cand.id)) options.push(cand);
  }
  shuffle(options);

  trialCountEl.textContent = state.currentTrial+1;
  showChoices(options, target);
  // play after a short delay
  await sleep(350);
  const level = Math.round(state.stair[chosenEar].level);
  trialInfoUpdate(chosenEar, level);
  if(USE_TTS){
    speakWord(target.word, chosenEar, level);
  } else {
    const buf = target._buffer;
    if(buf) playBuffer(buf, chosenEar, levelToGain(level));
    else playBeep(chosenEar, levelToGain(level));
  }
  startTrialTimer();
}

function showChoices(options, target){
  choicesEl.innerHTML = '';
  options.forEach(opt=>{
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.dataset.id = opt.id;
    btn.innerHTML = `<img src="${opt.img}" alt="${opt.word}" onerror="this.src='assets/img/placeholder.svg'"/><div class="word">${opt.word}</div>`;
    btn.addEventListener('click', onChoiceClicked);
    choicesEl.appendChild(btn);
  });
  // store metadata for response handling
  lastTargetId = target.id;
  awaitingAnswer = true;
}

function onChoiceClicked(e){
  if(!awaitingAnswer) return;
  awaitingAnswer = false;
  clearTrialTimer();
  try{ speechSynthesis.cancel(); }catch(e){}
  const id = e.currentTarget.dataset.id;
  const correct = id === lastTargetId;
  markChoices(id, lastTargetId);
  const trialEar = lastTrialEar;
  // record and update staircase
  recordResponse(trialEar, state.stair[trialEar].level, correct);
  updateStaircase(trialEar, correct);
  state.currentTrial++;
  setTimeout(()=>{
    nextTrial();
  }, 600);
}

function markChoices(chosenId, correctId){
  Array.from(choicesEl.children).forEach(btn=>{
    if(btn.dataset.id===correctId) btn.classList.add('correct');
    if(chosenId && btn.dataset.id===chosenId && chosenId!==correctId) btn.classList.add('wrong');
  });
}

function recordResponse(ear, level, correct){
  state.results[ear].push({level, correct});
}

function updateStaircase(ear, correct){
  const s = state.stair[ear];
  if(s.done) return;
  const prevLevel = s.level;
  const direction = correct ? 'down' : 'up';
  // detect reversal
  if(s.lastDirection && s.lastDirection !== direction){
    // record reversal at previous level
    s.reversals.push(prevLevel);
    // reduce step size after 3 reversals to refine
    if(s.reversals.length === 3){
      s.step = Math.max(s.minStep, Math.round(s.step/2));
    }
  }
  s.lastDirection = direction;
  // adjust level
  if(correct) s.level = Math.max(1, s.level - s.step);
  else s.level = Math.min(100, s.level + s.step);
  s.history.push({level: s.level, correct, time: Date.now()});
  // mark done if enough reversals
  if(s.reversals.length >= s.reversalTarget){
    s.done = true;
  }
}

// small helper to show ear and level in trial info
function trialInfoUpdate(ear, level){
  const el = document.getElementById('trial-info');
  el.textContent = `Trial ${state.currentTrial+1} — ${ear.toUpperCase()} level ${Math.round(level)}`;
  const fill = document.getElementById('level-bar-fill');
  const val = document.getElementById('level-value');
  if(fill) fill.style.width = `${Math.max(0,Math.min(100,level))}%`;
  if(val) val.textContent = `${Math.round(level)}`;
}

function finishTest(){
  trialScreen.classList.add('hidden');
  resultsScreen.classList.remove('hidden');
  const leftScore = summarizeEar('left');
  const rightScore = summarizeEar('right');
  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = `<p>Left ear score: <strong>${leftScore}</strong></p><p>Right ear score: <strong>${rightScore}</strong></p>`;
  // show a tiny recommendation
  const rec = document.createElement('p');
  rec.innerHTML = recommendation(leftScore, rightScore);
  resultsEl.appendChild(rec);
  // mark todo 1 completed and update plan
  completeTodo1();
}

function summarizeEar(ear){
  const s = state.stair[ear];
  if(s && s.reversals && s.reversals.length>0){
    // use mean of reversals as threshold
    const rev = s.reversals.slice(-Math.min(s.reversals.length, 6));
    const avg = Math.round(rev.reduce((a,b)=>a+b,0)/rev.length);
    return avg;
  }
  const arr = state.results[ear];
  if(!arr.length) return 'N/A';
  // fallback: average recorded levels (trim outliers)
  const levels = arr.map(r=>r.level).sort((a,b)=>a-b);
  const keep = levels.slice(Math.floor(levels.length*0.1), Math.ceil(levels.length*0.9));
  const avg = Math.round(keep.reduce((s,x)=>s+x,0)/keep.length);
  return avg;
}

function recommendation(l, r){
  if(l==='N/A' || r==='N/A') return 'Not enough data.';
  const li = Number(l), ri = Number(r);
  if(li<30 || ri<30) return 'Recommend audiology referral. Low score detected.';
  if(li<60 || ri<60) return 'Follow-up screening recommended.';
  return 'Hearing appears within normal limits for this screen.';
}

function startTrialTimer(){
  let remaining = 5;
  timerEl.textContent = remaining;
  trialEndTime = Date.now() + remaining*1000;
  trialTimer = setInterval(()=>{
    const t = Math.ceil((trialEndTime - Date.now())/1000);
    timerEl.textContent = Math.max(0,t);
    if(t<=0){
      clearTrialTimer();
      onTimeout();
    }
  },200);
}

function clearTrialTimer(){
  if(trialTimer) clearInterval(trialTimer);
  trialTimer = null;
}

function onTimeout(){
  awaitingAnswer = false;
  // stop any ongoing speech
  try{ speechSynthesis.cancel(); }catch(e){}
  // treat as wrong and increase level
  const trialEar = lastTrialEar;
  if(trialEar){
    recordResponse(trialEar, state.stair[trialEar].level, false);
    updateStaircase(trialEar, false);
    markChoices(null, lastTargetId);
  }
  state.currentTrial++;
  setTimeout(()=> nextTrial(), 600);
}

// Use SpeechSynthesis to speak the given word. Play a short panned beep cue before speaking to indicate ear.
function speakWord(word, ear='left', level=70){
  // Prefer meSpeak (synthesized to PCM -> AudioBuffer -> WebAudio) if available.
  const delay = 100;
  setTimeout(async ()=>{
  const norm = Math.max(1, Math.min(100, level))/100;
  const vol = 0.02 + (Math.pow(norm, 2) * 0.98);
  const finalGain = Math.max(0.001, Math.min(1, vol));
    // If mespeak is available, synthesize to PCM and play via WebAudio so we
      // Prefer using a preloaded AudioBuffer for the target word so playback is
      // panned and gain-controlled via WebAudio. If the buffer is missing, fall
      // back to native SpeechSynthesisUtterance or a generated panned buffer.
      const dictItem = DICTIONARY.find(d => d.word === word || d.id === word.toLowerCase());
      if(dictItem && dictItem._buffer){
        playBuffer(dictItem._buffer, ear, finalGain);
        return;
      }

      // If no preloaded buffer, prefer native SpeechSynthesisUtterance (per MDN)
    try{
      // choose an English voice if available
      const voices = speechSynthesis.getVoices ? speechSynthesis.getVoices() : [];
      let chosen = null;
      for(const v of voices){
        if(/en(-|$)/i.test(v.lang) || /english/i.test(v.name)) { chosen = v; break; }
      }
      // cancel any ongoing speech
      try{ speechSynthesis.cancel(); }catch(e){}
      const utter = new SpeechSynthesisUtterance(word);
      if(chosen) utter.voice = chosen;
      // set parameters (volume respects finalGain but browsers may clamp very low values)
      utter.volume = Math.max(0.01, Math.min(1, finalGain));
      utter.rate = 0.95;
      utter.pitch = 1.0;
      // fall back to playing a small generated buffer if the browser doesn't support voices or speaking
      let spoke = false;
      utter.onstart = ()=>{ spoke = true; };
      utter.onerror = (ev)=>{ console.warn('SpeechSynthesis error', ev); };
      utter.onend = ()=>{};
      try{
        speechSynthesis.speak(utter);
        // if voices are not immediately available, try generating a panned buffer after a short timeout
        setTimeout(()=>{
          if(!spoke){
            try{ const buf = generateSpeechLikeBuffer(word); playBuffer(buf, ear, finalGain); }
            catch(e){ playBeep(ear, levelToGain(level)); }
          }
        }, 250);
      }catch(e){
  // last resort: generated buffer or beep
  try{ const buf = generateSpeechLikeBuffer(word); playBuffer(buf, ear, finalGain); }
  catch(e2){ console.warn('TTS failed, falling back to beep', e2); playBeep(ear, levelToGain(level)); }
      }
    }catch(e){
      // final fallback
  try{ const buf = generateSpeechLikeBuffer(word); playBuffer(buf, ear, finalGain); }
  catch(e2){ console.warn('TTS completely failed', e2); playBeep(ear, levelToGain(level)); }
    }
  }, delay);
}

// crude client-side speech-like buffer generator: creates a brief sequence of pitched pulses
function generateSpeechLikeBuffer(text){
  const sr = ctx.sampleRate;
  const dur = 0.7;
  const frameCount = Math.floor(sr * dur);
  const buffer = ctx.createBuffer(1, frameCount, sr);
  const data = buffer.getChannelData(0);
  // derive a seed from the text to vary pitch
  let hash = 0;
  for(let i=0;i<text.length;i++) hash = ((hash<<5)-hash) + text.charCodeAt(i);
  const baseFreq = 300 + (Math.abs(hash) % 600);
  for(let i=0;i<frameCount;i++){
    const t = i/sr;
    // a series of short pulses to simulate syllables
    const envelope = Math.exp(-3*t);
    const pulse = Math.sin(2*Math.PI*(baseFreq + 80*Math.sin(2*Math.PI*3*t))*t);
    data[i] = 0.5 * envelope * pulse;
  }
  return buffer;
}

// use meSpeak to synthesize PCM and convert to AudioBuffer
// meSpeak synth removed; using native SpeechSynthesis only

function playLevelNoise(ear='left', level=70){
  try{
    const duration = 0.6;
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++){
      data[i] = (Math.random()*2-1) * (0.5);
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const nodeGain = ctx.createGain();
    // scale gain by level (map 1-100 -> 0.02 - 1.2)
    nodeGain.gain.value = levelToGain(level) * 0.6;
    const panner = ctx.createStereoPanner();
    panner.pan.value = ear==='left'?-1:1;
    src.connect(nodeGain).connect(panner).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + duration);
    lastNoiseSource = src;
  }catch(e){
    console.warn('playLevelNoise failed', e);
  }
}

function stopLevelNoise(){
  try{
    if(lastNoiseSource){
      try{ lastNoiseSource.stop(); }catch(e){}
      lastNoiseSource = null;
    }
  }catch(e){console.warn('stopLevelNoise failed', e);}
}

// Audio playback helpers
// Play a decoded AudioBuffer through panner/gain
function playBuffer(audioBuffer, ear='left', gain=1){
  try{
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    const nodeGain = ctx.createGain();
    nodeGain.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = ear==='left'?-1:1;
    src.connect(nodeGain).connect(panner).connect(ctx.destination);
    src.start();
  }catch(err){
    console.warn('playBuffer failed, falling back to beep', err);
    playBeep(ear, gain);
  }
}

function playBeep(ear='left', gain=1){
  try{
    const osc = ctx.createOscillator();
    const nodeGain = ctx.createGain();
    nodeGain.gain.value = gain * 0.2;
    const panner = ctx.createStereoPanner();
    panner.pan.value = ear==='left'?-1:1;
    osc.type = 'sine';
    osc.frequency.value = 600 + Math.random()*800;
    osc.connect(nodeGain).connect(panner).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  }catch(e){
    console.warn('fallback beep failed', e);
  }
}

// Preload audio buffers for dictionary items; if file missing or decode fails, generate a small synthetic buffer
async function preloadAudioBuffers(){
  const promises = DICTIONARY.map(async (item, idx)=>{
    if(!item.audio) return;
    try{
      const resp = await fetch(item.audio);
      if(!resp.ok) throw new Error('not found');
      const ab = await resp.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab);
      item._buffer = buf;
    }catch(err){
      // generate synthetic buffer so each word has a distinct demo sound
      item._buffer = generateDemoBufferForIndex(idx);
    }
  });
  await Promise.all(promises);
}

// Generate a short AudioBuffer with a couple of brief tones and an amplitude envelope
function generateDemoBufferForIndex(idx){
  const sr = ctx.sampleRate;
  const dur = 0.6; // seconds
  const frameCount = Math.floor(sr * dur);
  const buffer = ctx.createBuffer(1, frameCount, sr);
  const data = buffer.getChannelData(0);
  // pick two frequencies based on index to differentiate words
  const base = 500 + (idx % 8) * 120;
  const alt = base + 220;
  for(let i=0;i<frameCount;i++){
    const t = i / sr;
    // envelope: quick attack, exponential decay
    const env = Math.max(0, Math.min(1, 1 - (t/dur)));
    // combine two sine bursts with slight FM
    const val = 0.6*Math.sin(2*Math.PI*base*t + 0.2*Math.sin(2*Math.PI*5*t)) + 0.4*Math.sin(2*Math.PI*alt*t);
    data[i] = (val * env) * 0.6; 
  }
  return buffer;
}

function levelToGain(level){
  // level 1-100 maps to linear gain roughly 0.02 - 1.2
  const n = Math.max(1,Math.min(100,level));
  return 0.02 + (n/100)*1.18;
}

// utilities
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a}

// Small integration with todo list tool: mark todo 1 completed
function completeTodo1(){
  // call out-of-band - we will update the todo list via the tool from the assistant
}
