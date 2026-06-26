'use strict';
(function(){
  // ---- colors ----
  var COLORS = [
    {k:'W', name:'Белый',  hex:'#f2f2f2'}, {k:'R', name:'Красный',  hex:'#e02a2a'}, {k:'Y', name:'Жёлтый',     hex:'#ffd500'},
    {k:'P', name:'Розовый', hex:'#ff66b3'}, {k:'K', name:'Чёрный',  hex:'#1d1d1f'}, {k:'N', name:'Коричневый', hex:'#8a5524'}
  ];
  var DEFAULT_COLORS = COLORS.map(function(c){ return {k:c.k, name:c.name, hex:c.hex}; });
  var NAME = {};
  function refreshNames(){ NAME={}; COLORS.forEach(function(c){ NAME[c.k]=c.name; }); }
  // push the editable hex values into CSS variables so every sticker/swatch/3D
  // face that uses `s-<key>` (which reads var(--<key>)) updates instantly.
  function applyColorVars(){ COLORS.forEach(function(c){ document.documentElement.style.setProperty('--'+c.k, c.hex); }); }
  function persistColors(){ try{ localStorage.setItem('rbk-colors', JSON.stringify(COLORS)); }catch(e){} }
  function persistCube(){ try{ localStorage.setItem('rbk-cube', JSON.stringify(paint)); }catch(e){} }
  function loadCube(){ try{ var a=JSON.parse(localStorage.getItem('rbk-cube')||'null'); if(a&&a.length===54){ for(var i=0;i<54;i++) paint[i]=a[i]; return true; } }catch(e){} return false; }

  // ---- share link: 54 color keys packed into the URL hash (#c=...), null → '-' ----
  function encodeShare(){ var s=''; for(var i=0;i<54;i++){ var k=paint[i]; s+=(k&&'WRYPKN'.indexOf(k)>=0)?k:'-'; } return s; }
  function applyShareFromHash(){
    var m=(location.hash||'').match(/c=([WRYPKN\-]{54})/);
    if(!m) return false;
    for(var i=0;i<54;i++){ var ch=m[1].charAt(i); paint[i]=(ch==='-')?null:ch; }
    return true;
  }
  function shareLink(){
    var url=location.origin+location.pathname+'#c='+encodeShare();
    function ok(){ msg('Ссылка скопирована — позиция кубика зашита в неё.','ok'); }
    if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(ok,function(){ prompt('Скопируйте ссылку:',url); });
    else prompt('Скопируйте ссылку:',url);
  }
  // ---- apply a scramble typed as moves (R U R' U2 ...) onto a solved cube ----
  function applyScramble(text){
    var toks=(text||'').trim().split(/\s+/).filter(Boolean);
    if(!toks.length){ msg('Введите ходы, например: R U R′ U′'); return; }
    for(var i=0;i<toks.length;i++) if(!Cube.MOVES[toks[i]]){ msg('Непонятный ход: «'+toks[i]+'». Допустимы U R F D L B с ′ или 2.'); return; }
    var st=Cube.applySeq(Cube.solved(), toks), fc=Cube.toFacelets(st);
    for(var j=0;j<54;j++) paint[j]=SOLVED[fc[j]];
    clearMsg(); renderInput();
  }
  // ---- colour-blind aid: show each sticker's colour-key letter on top ----
  function setLetters(on){ document.body.classList.toggle('show-letters', !!on); try{ localStorage.setItem('rbk-letters', on?'1':''); }catch(e){} }

  // ===================== LEARNING MODE =====================
  // Core algorithms for the reference sheet.
  var ALGOS = [
    {n:'Триггер (вставка угла)',        s:"R U R'",                    w:'Первый слой: завести угол сверху в нижнее гнездо.'},
    {n:'Завод ребра вправо',            s:"U R U' R' U' F' U F",       w:'Средний слой: ребро без верхнего цвета уходит вправо.'},
    {n:'Завод ребра влево',             s:"U' L' U L U F U' F'",       w:'Средний слой: то же зеркально, влево.'},
    {n:'Крест сверху',                  s:"F R U R' U' F'",            w:'Развернуть рёбра верха: точка → уголок → линия → крест.'},
    {n:'Sune (разворот углов)',         s:"R U R' U R U2 R'",          w:'Развернуть верхние углы, пока грань не станет одного цвета.'},
    {n:'Перестановка углов (A-perm)',   s:"R' F R' B2 R F' R' B2 R2",  w:'Поставить верхние углы по местам (разворот не меняет).'},
    {n:'Перестановка рёбер (U-perm)',   s:"R U' R U R U R U' R' U' R2",w:'Поставить последние рёбра по местам — кубик собран.'}
  ];
  // Trainer: practice one phase at a time. Names match solver.js phase titles.
  var TRAINER_PHASES = ['Крест снизу','Углы снизу','Средний слой','Крест сверху',
                        'Разворот верхних углов','Расстановка верхних углов','Расстановка верхних рёбер'];

  // Animate a move sequence on the 3D cube starting from a solved cube, then restore.
  function demoSequence(moves){
    if (demoRunning || animating) return;
    demoRunning = true;
    var prevFolded = folded; folded = true; apply3D();
    var st = Cube.solved();
    render3Dfc(Cube.toFacelets(st));
    var i = 0;
    (function step(){
      if (i >= moves.length){
        demoRunning = false;
        if (solution) render3Dfc(solution.frames[ptr]); else render3D();
        folded = prevFolded; apply3D(); return;
      }
      var mv = moves[i++];
      animateMove(mv, function(){ st = Cube.applyMove(st, Cube.MOVES[mv]); render3Dfc(Cube.toFacelets(st)); step(); });
    })();
  }

  // Build a random cube already solved up to `targetName`, so the user drills that phase.
  function makePhaseStart(targetName){
    for (var tries=0; tries<60; tries++){
      var scr=Cube.solved();
      for (var k=0;k<25;k++) scr=Cube.applyMove(scr, Cube.MOVES[Cube.ALL_MOVES[(Math.random()*18)|0]]);
      var res=Solver.solve(scr), st=Cube.clone(scr), hit=false;
      for (var p=0;p<res.phases.length;p++){
        if (res.phases[p].name===targetName){ hit=true; break; }
        res.phases[p].groups.forEach(function(g){ g.moves.forEach(function(mv){ st=Cube.applyMove(st, Cube.MOVES[mv]); }); });
      }
      if (hit) return st;   // target phase has work for this scramble
    }
    return null;
  }
  function setPaintFromState(st){ var fc=Cube.toFacelets(st); for(var j=0;j<54;j++) paint[j]=SOLVED[fc[j]]; }
  function startTrainer(name){
    var st=makePhaseStart(name);
    if (!st){ msg('Не удалось подобрать случай — попробуйте ещё раз.'); return; }
    setPaintFromState(st);
    hintMode=true; var ch=$('chkHint'); if(ch) ch.checked=true;   // recall first
    $('learnPanel').classList.add('hidden');
    doSolve();   // earlier phases already solved → показ начинается с нужного этапа
    trainerActive=true; trainerPhase=name; usedHint=false;        // for progress auto-credit
  }

  // ---- learning panel (notation / reference / trainer share one container) ----
  var learnOpen = null;
  function toggleLearn(which){
    var lp=$('learnPanel');
    if (learnOpen===which){ lp.classList.add('hidden'); learnOpen=null; return; }
    learnOpen=which; lp.classList.remove('hidden'); lp.innerHTML='';
    if (which==='notation') buildNotation(lp);
    else if (which==='reference') buildReference(lp);
    else if (which==='trainer') buildTrainer(lp);
    else if (which==='recognize') buildRecognize(lp);
    else if (which==='progress') buildProgress(lp);
  }
  function buildNotation(lp){
    lp.innerHTML =
      '<h3>Нотация и термины</h3>'+
      '<p>Каждая буква — поворот одной грани <b>по часовой стрелке</b> (глядя прямо на неё): '+
      '<b>U</b> верх, <b>D</b> низ, <b>F</b> перёд, <b>B</b> зад, <b>L</b> лево, <b>R</b> право. '+
      'Штрих <b>′</b> — против часовой, <b>2</b> — пол-оборота.</p>'+
      '<p class="muted">Нажмите ход — кубик справа покажет его:</p>';
    var row=document.createElement('div'); row.className='demo-row';
    ['U',"U'","R","R'","F","F'","D","D'","L","L'","B","B'"].forEach(function(mv){
      var b=document.createElement('button'); b.textContent=mv; b.addEventListener('click', function(){ demoSequence([mv]); }); row.appendChild(b);
    });
    lp.appendChild(row);
    var t=document.createElement('p'); t.className='muted'; t.style.marginTop='10px';
    t.innerHTML='<b>Ребро</b> — деталь с 2 цветами, <b>угол</b> — с 3, <b>центр</b> — задаёт цвет грани. '+
      '<b>Ориентация</b> — каким боком повёрнута деталь; <b>перестановка</b> — на каком она месте.';
    lp.appendChild(t);
  }
  function buildReference(lp){
    lp.innerHTML='<h3>Справочник алгоритмов</h3><p class="muted">Шесть формул на всю сборку. «▶» — показать на кубике.</p>';
    ALGOS.forEach(function(a){
      var row=document.createElement('div'); row.className='algo-row';
      row.innerHTML='<div class="algo-row-h"><b>'+a.n+'</b> <button class="ghost play">▶</button></div>'+
        '<div class="algo-row-s">'+a.s+'</div><div class="muted algo-row-w">'+a.w+'</div>';
      row.querySelector('.play').addEventListener('click', function(){ demoSequence(a.s.split(/\s+/)); });
      lp.appendChild(row);
    });
  }
  function buildTrainer(lp){
    lp.innerHTML='<h3>Тренажёр по этапам</h3><p class="muted">Кубик соберётся до выбранного этапа — отработайте только его (подсказка скрыта, открывайте по кнопке). Жмите ещё раз — новый случай.</p>';
    var row=document.createElement('div'); row.className='demo-row';
    TRAINER_PHASES.forEach(function(name){
      var b=document.createElement('button'); b.textContent=name; b.addEventListener('click', function(){ startTrainer(name); }); row.appendChild(b);
    });
    lp.appendChild(row);
  }

  // ---- recognition quiz: which last-layer step does this cube need? ----
  var F2L_PHASES={'Крест снизу':1,'Углы снизу':1,'Средний слой':1};
  var LL_ORDER=['Крест сверху','Разворот верхних углов','Расстановка верхних углов','Расстановка верхних рёбер'];
  var LL_INFO={
    'Крест сверху':{alg:"F R U R' U' F'", tell:'Верхние рёбра ещё не образуют крест верхнего цвета (точка / уголок / линия).'},
    'Разворот верхних углов':{alg:"R U R' U R U2 R'", tell:'Крест есть, но не все углы смотрят верхним цветом вверх.'},
    'Расстановка верхних углов':{alg:"R' F R' B2 R F' R' B2 R2", tell:'Верх одного цвета, но углы стоят не на своих местах (бока не совпадают).'},
    'Расстановка верхних рёбер':{alg:"R U' R U R U R U' R' U' R2", tell:'Углы на местах — осталось переставить рёбра.'}
  };
  function genLLCase(){
    for(var t=0;t<80;t++){
      var scr=Cube.solved(); for(var k=0;k<25;k++) scr=Cube.applyMove(scr,Cube.MOVES[Cube.ALL_MOVES[(Math.random()*18)|0]]);
      var res=Solver.solve(scr), st=Cube.clone(scr);
      for(var p=0;p<res.phases.length;p++){
        if(F2L_PHASES[res.phases[p].name]) res.phases[p].groups.forEach(function(g){ g.moves.forEach(function(mv){ st=Cube.applyMove(st,Cube.MOVES[mv]); }); });
        else break;
      }
      var res2=Solver.solve(st);
      if(res2.phases.length) return { st:st, answer:res2.phases[0].name };
    }
    return null;
  }
  function buildRecognize(lp){
    lp.innerHTML='<h3>Узнай случай</h3><p class="muted">Кубик собран на 2 слоя. Посмотри на верх (покрути 3D) и определи, какой шаг последнего слоя сейчас нужен.</p><div id="recQ"></div>';
    nextRecognize();
  }
  function nextRecognize(){
    var c=genLLCase(), q=$('recQ'); if(!q) return;
    if(!c){ q.innerHTML='Не удалось подобрать случай.'; return; }
    setPaintFromState(c.st); renderInput();
    recAnswer=c.answer; recDone=false;
    q.innerHTML='<div class="demo-row" id="recOpts"></div><div id="recFb" style="margin-top:8px;font-size:13px"></div>';
    var opts=q.querySelector('#recOpts');
    LL_ORDER.forEach(function(name){
      var b=document.createElement('button'); b.textContent=name; b.style.minWidth='auto';
      b.addEventListener('click', function(){ answerRecognize(name); }); opts.appendChild(b);
    });
  }
  function answerRecognize(name){
    if(recDone) return; recDone=true;
    var ok=(name===recAnswer), info=LL_INFO[recAnswer], fb=$('recFb');
    fb.innerHTML=(ok?'<b style="color:var(--good)">Верно!</b> ':'<b style="color:var(--bad)">Не то.</b> Нужен: <b>'+recAnswer+'</b>. ')+
      info.tell+'<br>Алгоритм: <span class="algo-row-s">'+info.alg+'</span> '+
      '<button class="ghost play" id="recPlay">▶</button> &nbsp; <button class="ghost" id="recNext">Следующий ▶</button>';
    $('recPlay').addEventListener('click', function(){ demoSequence(info.alg.split(/\s+/)); });
    $('recNext').addEventListener('click', nextRecognize);
  }

  // ---- progress tracker (auto-credit when a phase is solved unaided) ----
  function loadMastery(){ try{ MASTERY=JSON.parse(localStorage.getItem('rbk-mastery')||'{}')||{}; }catch(e){ MASTERY={}; } }
  function saveMastery(){ try{ localStorage.setItem('rbk-mastery', JSON.stringify(MASTERY)); }catch(e){} }
  function markMastered(name){ MASTERY[name]=(MASTERY[name]||0)+1; saveMastery(); showToast('✓ Этап «'+name+'» собран без подсказки!'); }
  function showToast(text){
    var t=$('toast'); if(!t){ t=document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
    t.textContent=text; t.classList.add('show');
    clearTimeout(showToast._t); showToast._t=setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }
  function buildProgress(lp){
    loadMastery();
    var done=TRAINER_PHASES.filter(function(n){ return MASTERY[n]>0; }).length;
    lp.innerHTML='<h3>Прогресс</h3><p class="muted">Этап засчитывается, когда ты собрал его в тренажёре <b>без «Показать ход»</b>. Освоено: '+done+' / '+TRAINER_PHASES.length+'.</p>';
    TRAINER_PHASES.forEach(function(n,i){
      var c=MASTERY[n]||0, row=document.createElement('div'); row.className='prog-row';
      row.innerHTML='<span>'+(c>0?'✓':'○')+' '+(i+1)+'. '+n+'</span><span class="muted">'+(c>0?('×'+c):'')+'</span>';
      lp.appendChild(row);
    });
    var rs=document.createElement('button'); rs.className='ghost'; rs.style.marginTop='8px'; rs.textContent='Сбросить прогресс';
    rs.addEventListener('click', function(){ MASTERY={}; saveMastery(); buildProgress(lp); });
    lp.appendChild(rs);
  }
  function loadColors(){
    try{
      var arr=JSON.parse(localStorage.getItem('rbk-colors')||'null'); if(!arr) return;
      arr.forEach(function(o){ var c=COLORS.filter(function(x){return x.k===o.k;})[0]; if(c){ if(o.hex)c.hex=o.hex; if(o.name)c.name=o.name; } });
    }catch(e){}
  }
  refreshNames();
  // Russian names of the six faces (kept alongside the standard U/R/F/D/L/B letters)
  var FACENAME = {U:'Верх', D:'Низ', F:'Перёд', B:'Зад', L:'Лево', R:'Право'};

  // face letter -> global facelet base, center index, net class
  var FACES = [
    {f:'U', base:0,  center:4,  cls:'face-U'},
    {f:'L', base:36, center:40, cls:'face-L'},
    {f:'F', base:18, center:22, cls:'face-F'},
    {f:'R', base:9,  center:13, cls:'face-R'},
    {f:'B', base:45, center:49, cls:'face-B'},
    {f:'D', base:27, center:31, cls:'face-D'}
  ];
  var CENTER_OF = {U:4,R:13,F:22,D:31,L:40,B:49};
  // default solved color scheme (just a starting point — you can repaint any
  // sticker, including centers, to match your cube's actual arrangement).
  var SOLVED = {U:'W', D:'Y', F:'R', B:'P', L:'K', R:'N'};

  // ---- state ----
  var paint = new Array(54).fill(null);     // current input: color key or null
  var selColor = 'W';
  var stickerEls = new Array(54);
  var solution = null;                       // {phases, frames, steps, ...}
  var ptr = 0;                               // playback pointer 0..total
  var playTimer = null;
  // 3D cube preview state
  var face3dEls = new Array(54), face3dFaceEls = {};
  var rx = -24, ry = -32, folded = true, dragging = false, lastX = 0, lastY = 0, startX = 0, startY = 0, moved = false;
  // learning mode state
  var hintMode = false, revealed = false, demoRunning = false;
  var recAnswer = null, recDone = false;                 // recognition quiz
  var trainerActive = false, trainerPhase = '', usedHint = false; // trainer/progress
  var MASTERY = {};

  var $ = function(id){ return document.getElementById(id); };

  // ---------- build net + palette ----------
  function buildNet(){
    var net = $('net'); net.innerHTML='';
    FACES.forEach(function(face){
      var fd = document.createElement('div');
      fd.className = 'face '+face.cls;
      var lbl = document.createElement('span'); lbl.className='lbl'; lbl.textContent=face.f; fd.appendChild(lbl);
      for (var i=0;i<9;i++){
        var idx = face.base+i;
        var st = document.createElement('div');
        st.className='sticker';
        st.dataset.idx = idx;
        if (i===4) st.classList.add('center');
        st.addEventListener('click', onStickerClick);
        stickerEls[idx]=st; fd.appendChild(st);
      }
      net.appendChild(fd);
    });
  }
  function buildPalette(){
    var p=$('palette'); p.innerHTML='';
    COLORS.forEach(function(c){
      var sw=document.createElement('div');
      sw.className='swatch s-'+c.k+(c.k===selColor?' sel':'');
      sw.title=c.name; sw.dataset.k=c.k;
      sw.addEventListener('click', function(){ selColor=c.k; buildPalette(); });
      p.appendChild(sw);
    });
    var h=document.createElement('span'); h.className='hint'; h.textContent='Выберите цвет и кликайте по квадратикам';
    p.appendChild(h);
  }
  function buildLegend(){
    var l=$('legend'); l.innerHTML='';
    FACES.forEach(function(face){
      var key = paint[face.center] || SOLVED[face.f];
      var d=document.createElement('div');
      d.innerHTML='<span class="dot s-'+key+'"></span> '+face.f+' ('+FACENAME[face.f]+') — '+NAME[key];
      l.appendChild(d);
    });
  }
  // ---- editable palette: pick any hex / rename each of the six colors ----
  function buildColorEditor(){
    var ce=$('colorEditor'); ce.innerHTML='';
    COLORS.forEach(function(c){
      var row=document.createElement('div'); row.className='ce-row';
      var ci=document.createElement('input'); ci.type='color'; ci.value=c.hex; ci.title='Цвет';
      ci.addEventListener('input', function(){ c.hex=ci.value; applyColorVars(); persistColors(); });
      var ni=document.createElement('input'); ni.type='text'; ni.value=c.name; ni.maxLength=24; ni.title='Название';
      ni.addEventListener('input', function(){ c.name=ni.value.trim()||c.name; refreshNames(); buildLegend(); persistColors(); });
      row.appendChild(ci); row.appendChild(ni); ce.appendChild(row);
    });
    var reset=document.createElement('button'); reset.className='ghost ce-reset'; reset.textContent='Вернуть цвета по умолчанию';
    reset.addEventListener('click', resetColors);
    ce.appendChild(reset);
  }
  function resetColors(){
    DEFAULT_COLORS.forEach(function(d){ var c=COLORS.filter(function(x){return x.k===d.k;})[0]; c.hex=d.hex; c.name=d.name; });
    applyColorVars(); refreshNames(); buildLegend(); buildColorEditor(); persistColors();
  }

  // ---------- interactive 3D cube ----------
  // 54 individually-positioned stickers (children of #cube3d, centred on the cube
  // centre) so a whole layer — face + the 12-sticker ring — can rotate as a rigid group.
  var FS3=78, HALF3=39, STEP3=27, PAD3=6;
  var FACEDEF=[{f:'U',base:0,rot:'rotateX(90deg) '},{f:'D',base:27,rot:'rotateX(-90deg) '},
               {f:'F',base:18,rot:''},{f:'B',base:45,rot:'rotateY(180deg) '},
               {f:'R',base:9,rot:'rotateY(90deg) '},{f:'L',base:36,rot:'rotateY(-90deg) '}];
  var ST_BASE=new Array(54), ST_FLAT=new Array(54);
  function buildTransforms(){
    var fc={U:[0,-(FS3+PAD3)],D:[0,FS3+PAD3],F:[0,0],B:[2*(FS3+PAD3),0],R:[FS3+PAD3,0],L:[-(FS3+PAD3),0]};
    FACEDEF.forEach(function(fd){
      for(var i=0;i<9;i++){
        var g=fd.base+i, dx=((i%3)-1)*STEP3, dy=(((i/3)|0)-1)*STEP3;
        ST_BASE[g]=fd.rot+'translateZ('+HALF3+'px) translate('+dx+'px,'+dy+'px)';
        ST_FLAT[g]='translate('+(fc[fd.f][0]+dx)+'px,'+(fc[fd.f][1]+dy)+'px)';
      }
    });
  }
  // facelets in each turning layer = face's 9 + the 12-sticker ring (engine-derived).
  var LAYER={
    U:[0,1,2,3,4,5,6,7,8, 9,10,11,18,19,20,36,37,38,45,46,47],
    D:[27,28,29,30,31,32,33,34,35, 15,16,17,24,25,26,42,43,44,51,52,53],
    F:[18,19,20,21,22,23,24,25,26, 6,7,8,9,12,15,27,28,29,38,41,44],
    B:[45,46,47,48,49,50,51,52,53, 0,1,2,11,14,17,33,34,35,36,39,42],
    R:[9,10,11,12,13,14,15,16,17, 2,5,8,20,23,26,29,32,35,45,48,51],
    L:[36,37,38,39,40,41,42,43,44, 0,3,6,18,21,24,27,30,33,47,50,53]
  };
  // axis + sign so a quarter turn looks clockwise-from-outside (CSS is left-handed, Y down).
  var AXIS={U:'Y',D:'Y',F:'Z',B:'Z',R:'X',L:'X'}, SIGN={U:-1,D:1,F:1,B:-1,R:1,L:-1};

  function build3D(){
    var cube=$('cube3d'); if(!cube) return; buildTransforms(); cube.innerHTML='';
    for(var g=0;g<54;g++){ var st=document.createElement('div'); st.className='st3'; st.dataset.idx=g; face3dEls[g]=st; cube.appendChild(st); }
    apply3D();
  }
  function render3D(){
    for(var i=0;i<54;i++){ var st=face3dEls[i]; if(st){ st.className='st3 '+(paint[i]?('s-'+paint[i]):'s-empty'); st.dataset.k=paint[i]||''; } }
  }
  function render3Dfc(fc){
    var l2c=letterToColor();
    for(var i=0;i<54;i++){ var st=face3dEls[i]; if(st){ var k=l2c[fc[i]]; st.className='st3 s-'+k; st.dataset.k=k; } }
  }
  var animating = false;
  // Rotate the whole layer rigidly, then snap to base positions and recolour to the
  // new state (at 90° the rotated layer coincides with the base grid, so the snap is seamless).
  function animateMove(move, done){
    var L=move[0], suf=move.slice(1);
    if(!folded || !LAYER[L]){ done(); return; }
    var deg = SIGN[L]*(suf==='2'?180:(suf==="'"?-90:90));
    var rot='rotate'+AXIS[L]+'('+deg+'deg) ';
    animating=true;
    LAYER[L].forEach(function(g){ var st=face3dEls[g]; st.style.transition='transform .26s ease-in-out'; st.style.transform=rot+ST_BASE[g]; });
    setTimeout(function(){ LAYER[L].forEach(function(g){ var st=face3dEls[g]; st.style.transition=''; st.style.transform=ST_BASE[g]; }); animating=false; done(); }, 280);
  }
  function applyView(){
    var cube=$('cube3d'); if(!cube) return;
    cube.style.transform = folded ? ('rotateX('+rx+'deg) rotateY('+ry+'deg)') : 'scale(.62)';
  }
  function apply3D(){
    applyView();
    for(var g=0;g<54;g++){ var st=face3dEls[g]; if(st) st.style.transform = folded ? ST_BASE[g] : ST_FLAT[g]; }
  }
  function toggleFold(){
    folded=!folded; apply3D();
    $('btnFold').textContent = folded ? 'Развернуть в плоскость ▦' : 'Свернуть в кубик ◳';
    $('foldHint').textContent = folded ? 'Тяните — повернуть · клик — покрасить' : 'Это та же развёртка, что и слева';
  }
  function ptXY(e){ var t=(e.touches&&e.touches[0])?e.touches[0]:e; return {x:t.clientX, y:t.clientY}; }
  function dragStart(e){ dragging=true; moved=false; var p=ptXY(e); startX=lastX=p.x; startY=lastY=p.y; }
  function dragMove(e){
    if(!dragging) return; var p=ptXY(e);
    if(Math.abs(p.x-startX)+Math.abs(p.y-startY)>6) moved=true;
    if(folded){ ry+=(p.x-lastX)*0.5; rx-=(p.y-lastY)*0.5; rx=Math.max(-89,Math.min(89,rx)); lastX=p.x; lastY=p.y; applyView(); }
    if(e.cancelable && moved) e.preventDefault();
  }
  // A tap (no drag) on a 3D sticker paints it — only while editing (not during playback).
  function dragEnd(e){
    if(dragging && !moved && !solution && e){
      var t=e.target;
      if(t && t.classList && t.classList.contains('st3') && t.dataset.idx!=null){ paint[+t.dataset.idx]=selColor; renderInput(); }
    }
    dragging=false;
  }

  function onStickerClick(e){
    if (solution) return; // not in edit mode
    var idx = +e.currentTarget.dataset.idx;
    paint[idx] = selColor;
    renderInput();
  }

  // ---------- rendering ----------
  function paintClass(key){ return 'sticker'+(key?(' s-'+key):' s-empty'); }
  function renderInput(){
    for (var i=0;i<54;i++){
      var st=stickerEls[i]; if(!st) continue;
      st.className = paintClass(paint[i]) + ((i%9===4)?' center':'');
      st.dataset.k = paint[i]||'';
    }
    buildLegend();
    render3D();
    persistCube();
  }
  // show a facelet array (face letters) using the user's center colors
  function renderFrame(fc, hiFace){
    var l2c = letterToColor();
    for (var i=0;i<54;i++){
      var st=stickerEls[i]; if(!st) continue;
      var key = l2c[fc[i]];
      st.className = 'sticker s-'+key + ((i%9===4)?' center':'');
      st.dataset.k = key;
    }
    if (hiFace){
      var fdef = FACES.filter(function(f){return f.f===hiFace;})[0];
      for (var j=0;j<9;j++) stickerEls[fdef.base+j].classList.add('move-hi');
      // dim the rest for focus
    }
  }
  function letterToColor(){
    // map face letter -> color key, from the entered centers
    var m={};
    ['U','R','F','D','L','B'].forEach(function(L){ m[L]= paint[CENTER_OF[L]] || SOLVED[L]; });
    return m;
  }

  // ---------- presets ----------
  function setSolved(){
    FACES.forEach(function(face){ for(var i=0;i<9;i++) paint[face.base+i]=SOLVED[face.f]; });
  }
  function setScramble(){
    var s=Cube.solved(), all=Cube.ALL_MOVES;
    for (var i=0;i<25;i++) s=Cube.applyMove(s, Cube.MOVES[all[(Math.random()*18)|0]]);
    var fc=Cube.toFacelets(s);
    for (var j=0;j<54;j++) paint[j]=SOLVED[fc[j]];   // letter -> standard color
  }
  function setClear(){
    for (var i=0;i<54;i++) paint[i] = (i%9===4) ? SOLVED[FACES.filter(function(f){return f.center===i;})[0].f] : null;
  }

  // ---------- messages ----------
  function msg(text, kind){
    var m=$('msg'); m.textContent=text; m.className='msg show '+(kind||'err');
  }
  function clearMsg(){ $('msg').className='msg'; $('msg').innerHTML=''; }
  function msgAction(text, label, fn){
    var m=$('msg'); m.className='msg show err'; m.innerHTML='';
    m.appendChild(document.createTextNode(text));
    m.appendChild(document.createElement('br'));
    var b=document.createElement('button'); b.className='primary'; b.style.marginTop='9px'; b.textContent=label;
    b.addEventListener('click', fn);
    m.appendChild(b);
  }

  // ---------- diagnostics ----------
  var OPP = {U:'D',D:'U',R:'L',L:'R',F:'B',B:'F'};
  var CORNER_LOC = ['верх-право-перёд (U·R·F)','верх-перёд-лево (U·F·L)','верх-лево-зад (U·L·B)','верх-зад-право (U·B·R)',
                    'низ-перёд-право (D·F·R)','низ-лево-перёд (D·L·F)','низ-зад-лево (D·B·L)','низ-право-зад (D·R·B)'];
  var EDGE_LOC = ['верх-право (U·R)','верх-перёд (U·F)','верх-лево (U·L)','верх-зад (U·B)','низ-право (D·R)','низ-перёд (D·F)',
                  'низ-лево (D·L)','низ-зад (D·B)','перёд-право (F·R)','перёд-лево (F·L)','зад-лево (B·L)','зад-право (B·R)'];
  // Find pieces that can't physically exist (a repeated color, or two opposite-face colors).
  function diagnose(fc){
    var nm={}, l2c=letterToColor();
    ['U','R','F','D','L','B'].forEach(function(L){ nm[L]=NAME[l2c[L]]; });
    var badset={}, msgs=[];
    function check(idxs, loc){
      var ls=idxs.map(function(p){return fc[p];}), a, b;
      for(a=0;a<ls.length;a++) for(b=a+1;b<ls.length;b++) if(ls[a]===ls[b]){
        idxs.forEach(function(p){badset[p]=1;});
        msgs.push('У элемента «'+loc+'» дважды цвет '+nm[ls[a]]+' — на одном элементе цвет не повторяется.'); return; }
      for(a=0;a<ls.length;a++) for(b=a+1;b<ls.length;b++) if(OPP[ls[a]]===ls[b]){
        idxs.forEach(function(p){badset[p]=1;});
        msgs.push('У элемента «'+loc+'» вместе '+nm[ls[a]]+' и '+nm[ls[b]]+' — эти цвета на противоположных гранях и не могут быть на одном элементе.'); return; }
    }
    for(var i=0;i<8;i++) check(Cube.CORNER_FL[i], CORNER_LOC[i]);
    for(var j=0;j<12;j++) check(Cube.EDGE_FL[j], EDGE_LOC[j]);
    return { idx:Object.keys(badset).map(Number), msgs:msgs };
  }
  function clearBad(){ for(var i=0;i<54;i++) if(stickerEls[i]) stickerEls[i].classList.remove('bad'); }

  // ---------- solve ----------
  function col2faceInv(map, letter){ for (var k in map) if(map[k]===letter) return k; return '?'; }
  // Read the painted cube; returns {state} or {error[, bad]}.
  function readCube(){
    var i, nulls=0; for(i=0;i<54;i++) if(paint[i]==null) nulls++;
    if (nulls) return {error:'Сначала раскрасьте все квадратики — осталось '+nulls+'.'};
    var centers=FACES.map(function(f){return paint[f.center];}), cset={};
    centers.forEach(function(k){cset[k]=1;});
    if (Object.keys(cset).length!==6) return {error:'Все 6 центров должны быть разного цвета. Проверьте центральные квадратики.'};
    var col2face={}; FACES.forEach(function(f){ col2face[paint[f.center]]=f.f; });
    var fc=paint.map(function(k){ return col2face[k]; });
    var cnt={}; fc.forEach(function(L){ cnt[L]=(cnt[L]||0)+1; });
    var bad=[]; ['U','R','F','D','L','B'].forEach(function(L){ if(cnt[L]!==9) bad.push(NAME[col2faceInv(col2face,L)]+': '+(cnt[L]||0)); });
    if (bad.length) return {error:'Каждого цвета должно быть ровно 9. Сейчас не так — '+bad.join(', ')+'.'};
    var probs=diagnose(fc);
    if (probs.msgs.length){
      var more=probs.msgs.length>2?(' (и ещё '+(probs.msgs.length-2)+' подсвечено)'):'';
      return {error:'Посмотрите на подсвеченные квадратики. '+probs.msgs.slice(0,2).join(' ')+more, bad:probs.idx};
    }
    return {state:Cube.fromFacelets(fc)};
  }

  function doSolve(){
    clearMsg(); clearBad(); trainerActive=false;   // normal solve isn't a trainer session
    var r=readCube();
    if (r.error){ if(r.bad) r.bad.forEach(function(p){ if(stickerEls[p]) stickerEls[p].classList.add('bad'); }); msg(r.error); return; }
    var state=r.state, i;
    var v=Cube.validateState(state);
    if (!v.ok){
      var tw=0; for(i=0;i<8;i++) tw+=state.co[i]; tw%=3;
      var fl=0; for(i=0;i<12;i++) fl+=state.eo[i]; fl%=2;
      if (tw!==0) return msgAction(v.reason+' Это физический дефект сборки: один угол стоит повёрнутым, и поворотами граней это не лечится.',
                                   'Найти угол и показать, как починить ▶', function(){ solveDefect('twist'); });
      if (fl!==0) return msgAction(v.reason+' Это физический дефект сборки: одно ребро стоит перевёрнутым.',
                                   'Найти ребро и показать, как починить ▶', function(){ solveDefect('flip'); });
      msg(v.reason+' (Подсказка: перенесите кубик точь-в-точь.)'); return;
    }
    var res=Solver.solve(state);
    if (!Cube.isSolved(res.state)){ msg('Не удалось найти решение — перепроверьте цвета.'); return; }
    if (res.moves.length===0){ msg('Этот кубик уже собран — делать нечего! 🎉','ok'); return; }
    buildSolution(state, res, null);
    enterPlayback();
  }

  // Solve everything possible and leave the impossible defect isolated on one
  // accessible top piece, so the user can fix it by hand at the end.
  function solveDefect(type){
    var r=readCube(); if (r.error){ msg(r.error); return; }
    var state=r.state, state2=Cube.clone(state), slot, i;
    if (type==='twist'){
      var t=0; for(i=0;i<8;i++) t+=state2.co[i]; t%=3;
      var j=state2.cp.indexOf(0);                 // slot currently holding the URF cubie
      state2.co[j]=(state2.co[j]-t+3)%3;          // so the leftover twist lands on URF (slot 0)
      slot=0;
    } else {
      var f=0; for(i=0;i<12;i++) f+=state2.eo[i]; f%=2;
      var j2=state2.ep.indexOf(1);                // slot currently holding the UF cubie
      state2.eo[j2]=(state2.eo[j2]+f)%2;          // leftover flip lands on UF (slot 1)
      slot=1;
    }
    var v=Cube.validateState(state2);
    if (!v.ok){ msg('В кубике сразу несколько несоответствий — сначала перепроверьте ввод. ('+v.reason+')'); return; }
    var res=Solver.solve(state2);
    if (!Cube.isSolved(res.state)){ msg('Не получилось разобрать дефект — перепроверьте ввод.'); return; }
    buildSolution(state, res, {type:type, slot:slot});
    enterPlayback();
  }

  function buildSolution(state, res, defect){
    // flat steps + frames (facelets before each move; last = solved-except-defect)
    var steps=[], ranges=[], groups=[], idx=0, s=Cube.clone(state);
    var frames=[ Cube.toFacelets(s) ];
    res.phases.forEach(function(p, pi){
      var pstart=idx;
      p.groups.forEach(function(g){
        var gstart=idx, gi=groups.length;
        g.moves.forEach(function(mv){
          steps.push({move:mv, phase:pi, group:gi});
          s=Cube.applyMove(s, Cube.MOVES[mv]);
          frames.push(Cube.toFacelets(s));
          idx++;
        });
        groups.push({name:g.name, desc:g.desc, phase:pi, start:gstart, end:idx});
      });
      ranges.push({name:p.name, hint:p.hint, start:pstart, end:idx});
    });
    solution = { phases:res.phases, ranges:ranges, groups:groups, steps:steps, frames:frames, total:steps.length, defect:defect||null };
    ptr=0;
  }

  // ---------- playback ----------
  function enterPlayback(){
    $('inputControls').classList.add('hidden');
    $('helpCard').classList.add('hidden');
    $('playControls').classList.remove('hidden');
    $('playCard').classList.remove('hidden');
    // assemble the 3D cube so each move can be shown turning
    folded = true; apply3D(); revealed = false;
    $('btnFold').textContent = 'Развернуть в плоскость ▦';
    $('cubeTitle').textContent = 'Кубик 3D — поворачивается по шагам';
    $('foldHint').textContent = 'Тяните мышкой, чтобы повернуть';
    ensureOrientBanner();
    renderPlayback();
  }
  function exitPlayback(){
    stopPlay();
    solution=null; trainerActive=false;
    $('inputControls').classList.remove('hidden');
    $('helpCard').classList.remove('hidden');
    $('playControls').classList.add('hidden');
    $('playCard').classList.add('hidden');
    $('cubeTitle').textContent = 'Кубик 3D ⇄ развёртка';
    $('foldHint').textContent = 'Тяните — повернуть · клик — покрасить';
    renderInput();
  }
  function ensureOrientBanner(){
    if ($('orient')) { updateOrient(); return; }
    var card=$('playCard');
    var p=document.createElement('div'); p.className='orient'; p.id='orient';
    card.insertBefore(p, card.firstChild.nextSibling); // after <h2>
    updateOrient();
  }
  function updateOrient(){
    var m=letterToColor();
    $('orient').innerHTML='Держите кубик всё время одинаково: '+
      '<b>'+NAME[m.U]+'</b> сверху, <b>'+NAME[m.F]+'</b> к себе.';
  }

  var ARROW = { "":"↻", "'":"↺", "2":"↻↻" };
  function dirWord(suf){ return suf===""?"по часовой стрелке":suf==="'"?"против часовой стрелки":"на пол-оборота (180°)"; }

  function renderPlayback(){
    var sol=solution, i=ptr, m=letterToColor();
    renderFrame(sol.frames[i], i<sol.total ? sol.steps[i].move[0] : null);
    render3Dfc(sol.frames[i]);
    updateOrient();

    var atEnd = i>=sol.total;
    var phaseIdx = !atEnd ? sol.steps[i].phase : (sol.ranges.length-1);
    var rg = (phaseIdx>=0) ? sol.ranges[phaseIdx] : null;

    var grp = !atEnd ? sol.groups[sol.steps[i].group] : null;
    var hide = !atEnd && hintMode && !revealed;     // recall-yourself mode
    $('btnReveal').classList.toggle('hidden', !hide);
    if (!atEnd){
      $('phaseName').textContent = (phaseIdx+1)+'. '+rg.name;
      $('phaseHint').textContent = rg.hint;
      if (hide){
        $('algoBox').style.display='none';
        $('moveGlyph').textContent='?'; $('moveArrow').textContent='';
        $('moveDesc').innerHTML='<b>Твой ход?</b><div class="small">Вспомни сам по цели этапа выше, потом нажми «Показать ход».</div>';
      } else {
        $('algoBox').style.display='';
        $('algoName').textContent = grp.name;
        $('algoSeq').textContent = rangeMoves(grp.start, grp.end).join(' ');
        $('algoDesc').textContent = grp.desc || '';
        var mv=sol.steps[i].move, L=mv[0], suf=mv.slice(1);
        $('moveGlyph').textContent = mv;
        $('moveArrow').textContent = ARROW[suf];
        $('moveDesc').innerHTML = '<b>Поверните грань '+L+' ('+FACENAME[L]+', '+NAME[m[L]]+') '+dirWord(suf)+'.</b>'+
          '<div class="small">'+(suf==="2"?"Два поворота на четверть.":"Один поворот на четверть, глядя прямо на эту грань.")+'</div>';
      }
    } else if (sol.defect){
      $('algoBox').style.display='none';
      var d=sol.defect, fls = d.type==='twist' ? Cube.CORNER_FL[d.slot] : Cube.EDGE_FL[d.slot];
      fls.forEach(function(p){ stickerEls[p].classList.add('bad'); });
      $('moveGlyph').textContent='⚠'; $('moveArrow').textContent='';
      $('phaseName').textContent='Почти! Нужен ремонт';
      if (d.type==='twist'){
        $('phaseHint').textContent='Собрано всё, кроме одного угла.';
        $('moveDesc').innerHTML='<b>Этот угол (подсвечен) повёрнут вокруг своей оси.</b>'+
          '<div class="small">Дефект сборки: верхний угол спереди-справа, где сходятся '+
          NAME[m.U]+', '+NAME[m.R]+' и '+NAME[m.F]+'. Поверните сам уголок руками на треть оборота (не совпало — ещё на треть). Поворотами граней это не лечится — как чинить см. ниже.</div>';
      } else {
        $('phaseHint').textContent='Собрано всё, кроме одного ребра.';
        $('moveDesc').innerHTML='<b>Это ребро (подсвечено) перевёрнуто.</b>'+
          '<div class="small">Дефект сборки: верхнее ребро спереди ('+NAME[m.U]+'/'+NAME[m.F]+'). Выньте его и вставьте, перевернув на 180°.</div>';
      }
    } else {
      $('algoBox').style.display='none';
      $('phaseName').textContent = rg ? ((phaseIdx+1)+'. '+rg.name) : 'Готово';
      $('phaseHint').textContent = rg ? rg.hint : '';
      $('moveGlyph').textContent='✓'; $('moveArrow').textContent='';
      $('moveDesc').innerHTML='<b>Собрано!</b><div class="small">Каждая грань одного цвета. Отлично!</div>';
    }

    $('counter').textContent = !atEnd ? ('Ход '+(i+1)+' из '+sol.total) : (sol.defect?'Готово, кроме дефекта':('Готово — '+sol.total+' ходов'));
    $('progress').style.width = (sol.total ? (100*i/sol.total) : 100)+'%';
    renderPhaseList(phaseIdx);
    if (hide) $('seq').innerHTML='<span class="muted">скрыто — нажми «Показать ход»</span>';
    else if (grp) renderSeq(grp, i); else $('seq').innerHTML='';
    $('btnPrev').disabled = (i<=0);
    $('btnNext').disabled = (i>=sol.total);
  }
  function renderPhaseList(activeIdx){
    var ol=$('phaseList'); ol.innerHTML='';
    solution.ranges.forEach(function(rg, pi){
      var li=document.createElement('li');
      var cls = pi<activeIdx || (pi===activeIdx && ptr>=rg.end) ? 'done' : (pi===activeIdx?'active':'');
      if (ptr>=rg.end) cls='done'; else if(pi===activeIdx) cls='active';
      li.className=cls;
      li.innerHTML='<span>'+(pi+1)+'. '+rg.name+'</span><span class="cnt">'+(rg.end-rg.start)+'</span>';
      li.addEventListener('click', function(){ ptr=rg.start; stopPlay(); revealed=false; renderPlayback(); });
      ol.appendChild(li);
    });
  }
  function rangeMoves(a,b){ var o=[]; for(var k=a;k<b;k++) o.push(solution.steps[k].move); return o; }
  function renderSeq(rg, i){
    var seq=$('seq'); seq.innerHTML='';
    for (var k=rg.start;k<rg.end;k++){
      var t=document.createElement('span');
      var cls='tok'+(k<i?' past':'')+(k===i?' cur':'');
      t.className=cls; t.textContent=solution.steps[k].move;
      seq.appendChild(t); seq.appendChild(document.createTextNode(' '));
    }
  }

  function next(){
    if(animating) return;
    if(ptr>=solution.total){ stopPlay(); return; }
    animateMove(solution.steps[ptr].move, function(){
      ptr++; revealed=false;
      if (trainerActive && solution.ranges.length && ptr>=solution.ranges[0].end){  // finished the trained phase
        if (!usedHint) markMastered(trainerPhase);
        trainerActive=false;
      }
      renderPlayback();
    });
  }
  function prev(){ if(animating) return; if(ptr>0){ ptr--; revealed=false; renderPlayback(); } }
  function startPlay(){
    if (ptr>=solution.total) ptr=0;
    $('btnPlay').textContent='⏸ Пауза';
    playTimer=setInterval(function(){ if(ptr>=solution.total){ stopPlay(); } else next(); }, 800);
  }
  function stopPlay(){ if(playTimer){ clearInterval(playTimer); playTimer=null; } $('btnPlay').textContent='Автопоказ'; }
  function togglePlay(){ if(playTimer) stopPlay(); else startPlay(); }

  // ---------- wire up ----------
  function init(){
    loadColors(); applyColorVars(); loadMastery();
    buildNet(); buildPalette(); buildColorEditor(); build3D();
    // priority: shared position in URL → last entered cube → solved
    if (!applyShareFromHash() && !loadCube()) setSolved();
    try{ if(localStorage.getItem('rbk-letters')){ document.body.classList.add('show-letters'); var cl=$('chkLetters'); if(cl) cl.checked=true; } }catch(e){}
    renderInput();
    $('btnShare').addEventListener('click', shareLink);
    $('btnNotation').addEventListener('click', function(){ toggleLearn('notation'); });
    $('btnReference').addEventListener('click', function(){ toggleLearn('reference'); });
    $('btnTrainer').addEventListener('click', function(){ toggleLearn('trainer'); });
    $('btnRecognize').addEventListener('click', function(){ toggleLearn('recognize'); });
    $('btnProgress').addEventListener('click', function(){ toggleLearn('progress'); });
    $('chkHint').addEventListener('change', function(){ hintMode=this.checked; revealed=false; if(solution) renderPlayback(); });
    $('btnReveal').addEventListener('click', function(){ revealed=true; if(trainerActive) usedHint=true; renderPlayback(); });
    $('btnApplyScramble').addEventListener('click', function(){ applyScramble($('scrambleInput').value); });
    $('scrambleInput').addEventListener('keydown', function(e){ if(e.key==='Enter') applyScramble(this.value); });
    $('chkLetters').addEventListener('change', function(){ setLetters(this.checked); });
    $('btnColors').addEventListener('click', function(){
      var ed=$('colorEditor'); ed.classList.toggle('hidden');
      $('btnColors').textContent = (ed.classList.contains('hidden')?'🎨 Настроить цвета':'🎨 Скрыть настройку');
    });
    $('btnFold').addEventListener('click', toggleFold);
    var scene=$('scene');
    scene.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);
    scene.addEventListener('touchstart', dragStart, {passive:true});
    scene.addEventListener('touchmove', dragMove, {passive:false});
    scene.addEventListener('touchend', dragEnd);
    $('btnSolve').addEventListener('click', doSolve);
    $('btnSolved').addEventListener('click', function(){ setSolved(); renderInput(); clearMsg(); });
    $('btnScramble').addEventListener('click', function(){ setScramble(); renderInput(); clearMsg(); });
    $('btnClear').addEventListener('click', function(){ setClear(); renderInput(); clearMsg(); });
    $('btnNext').addEventListener('click', function(){ stopPlay(); next(); });
    $('btnPrev').addEventListener('click', function(){ stopPlay(); prev(); });
    $('btnPlay').addEventListener('click', togglePlay);
    $('btnEdit').addEventListener('click', exitPlayback);
    document.addEventListener('keydown', function(e){
      if (!solution) return;
      if (e.key==='ArrowRight'){ stopPlay(); next(); e.preventDefault(); }
      else if (e.key==='ArrowLeft'){ stopPlay(); prev(); e.preventDefault(); }
      else if (e.key===' '){ togglePlay(); e.preventDefault(); }
    });
  }
  if (document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded', init);

  // small hook for automated screenshots / debugging
  window.RBK = {
    scramble:function(){ setScramble(); renderInput(); },
    paintAt:function(i,k){ paint[i]=k; renderInput(); },
    get:function(i){ return paint[i]; },
    solve:doSolve,
    goto:function(n){ if(solution){ ptr=Math.max(0,Math.min(solution.total,n)); revealed=false; renderPlayback(); } },
    _spin:function(move,deg){ var L=move[0]; if(!LAYER[L])return; var rot='rotate'+AXIS[L]+'('+deg+'deg) '; LAYER[L].forEach(function(g){ face3dEls[g].style.transition='none'; face3dEls[g].style.transform=rot+ST_BASE[g]; }); },
    total:function(){ return solution?solution.total:0; }
  };
})();
