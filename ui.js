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
  var face3dEls = new Array(54);
  var rx = -24, ry = -32, folded = true, dragging = false, lastX = 0, lastY = 0;

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
  function build3D(){
    var cube=$('cube3d'); if(!cube) return; cube.innerHTML='';
    var faces=[{f:'U',base:0},{f:'D',base:27},{f:'F',base:18},{f:'B',base:45},{f:'L',base:36},{f:'R',base:9}];
    faces.forEach(function(face){
      var fd=document.createElement('div'); fd.className='face3d f-'+face.f; fd.dataset.l=face.f;
      for(var i=0;i<9;i++){ var st=document.createElement('div'); st.className='st3'; face3dEls[face.base+i]=st; fd.appendChild(st); }
      cube.appendChild(fd);
    });
    apply3D();
  }
  function render3D(){
    for(var i=0;i<54;i++){ var st=face3dEls[i]; if(st) st.className='st3 '+(paint[i]?('s-'+paint[i]):'s-empty'); }
  }
  function apply3D(){
    var cube=$('cube3d'); if(!cube) return;
    cube.classList.toggle('unfolded', !folded);
    cube.style.transform = folded ? ('rotateX('+rx+'deg) rotateY('+ry+'deg)') : 'rotateX(0deg) rotateY(0deg) scale(.6)';
  }
  function toggleFold(){
    folded=!folded; apply3D();
    $('btnFold').textContent = folded ? 'Развернуть в плоскость ▦' : 'Свернуть в кубик ◳';
    $('foldHint').textContent = folded ? 'Тяните мышкой, чтобы повернуть' : 'Это та же развёртка, что и слева';
  }
  function ptXY(e){ var t=(e.touches&&e.touches[0])?e.touches[0]:e; return {x:t.clientX, y:t.clientY}; }
  function dragStart(e){ if(!folded) return; dragging=true; var p=ptXY(e); lastX=p.x; lastY=p.y; }
  function dragMove(e){ if(!dragging) return; var p=ptXY(e); ry+=(p.x-lastX)*0.5; rx-=(p.y-lastY)*0.5; rx=Math.max(-89,Math.min(89,rx)); lastX=p.x; lastY=p.y; apply3D(); if(e.cancelable) e.preventDefault(); }
  function dragEnd(){ dragging=false; }

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
    }
    buildLegend();
    render3D();
  }
  // show a facelet array (face letters) using the user's center colors
  function renderFrame(fc, hiFace){
    var l2c = letterToColor();
    for (var i=0;i<54;i++){
      var st=stickerEls[i]; if(!st) continue;
      var key = l2c[fc[i]];
      var c = 'sticker s-'+key + ((i%9===4)?' center':'');
      st.className=c;
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
    clearMsg(); clearBad();
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
    // make stickers non-editable visually handled by solution!=null guard
    ensureOrientBanner();
    renderPlayback();
  }
  function exitPlayback(){
    stopPlay();
    solution=null;
    $('inputControls').classList.remove('hidden');
    $('helpCard').classList.remove('hidden');
    $('playControls').classList.add('hidden');
    $('playCard').classList.add('hidden');
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
    updateOrient();

    var atEnd = i>=sol.total;
    var phaseIdx = !atEnd ? sol.steps[i].phase : (sol.ranges.length-1);
    var rg = (phaseIdx>=0) ? sol.ranges[phaseIdx] : null;

    var grp = !atEnd ? sol.groups[sol.steps[i].group] : null;
    if (!atEnd){
      $('phaseName').textContent = (phaseIdx+1)+'. '+rg.name;
      $('phaseHint').textContent = rg.hint;
      // current algorithm
      $('algoBox').style.display='';
      $('algoName').textContent = grp.name;
      $('algoSeq').textContent = rangeMoves(grp.start, grp.end).join(' ');
      $('algoDesc').textContent = grp.desc || '';
      var mv=sol.steps[i].move, L=mv[0], suf=mv.slice(1);
      $('moveGlyph').textContent = mv;
      $('moveArrow').textContent = ARROW[suf];
      $('moveDesc').innerHTML = '<b>Поверните грань '+L+' ('+FACENAME[L]+', '+NAME[m[L]]+') '+dirWord(suf)+'.</b>'+
        '<div class="small">'+(suf==="2"?"Два поворота на четверть.":"Один поворот на четверть, глядя прямо на эту грань.")+'</div>';
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
    if (grp) renderSeq(grp, i); else $('seq').innerHTML='';
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
      li.addEventListener('click', function(){ ptr=rg.start; stopPlay(); renderPlayback(); });
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

  function next(){ if(ptr<solution.total){ ptr++; renderPlayback(); } else stopPlay(); }
  function prev(){ if(ptr>0){ ptr--; renderPlayback(); } }
  function startPlay(){
    if (ptr>=solution.total) ptr=0;
    $('btnPlay').textContent='Pause';
    playTimer=setInterval(function(){ if(ptr>=solution.total){ stopPlay(); } else next(); }, 750);
  }
  function stopPlay(){ if(playTimer){ clearInterval(playTimer); playTimer=null; } $('btnPlay').textContent='Auto-play'; }
  function togglePlay(){ if(playTimer) stopPlay(); else startPlay(); }

  // ---------- wire up ----------
  function init(){
    loadColors(); applyColorVars();
    buildNet(); buildPalette(); buildColorEditor(); build3D();
    setSolved(); renderInput();
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
    goto:function(n){ if(solution){ ptr=Math.max(0,Math.min(solution.total,n)); renderPlayback(); } },
    total:function(){ return solution?solution.total:0; }
  };
})();
