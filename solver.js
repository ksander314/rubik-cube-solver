/* solver.js — beginner layer-by-layer solver producing human-followable steps.
 * Depends on cube.js (Cube global / require). Node-testable: `node solver.js`.
 *
 * Output: an array of phases, each { name, hint, moves:[..] }, plus a flat move list.
 * Orientation convention: the cube is held as entered. First layer built on D
 * (bottom), last layer finished on U (top). Only face turns — no cube rotations —
 * so the user keeps the cube in one orientation the whole time.
 */
(function (root) {
  'use strict';
  var Cube = (typeof require !== 'undefined') ? require('./cube.js') : root.Cube;
  var MOVES = Cube.MOVES, ALL = Cube.ALL_MOVES, applyMove = Cube.applyMove;

  // face index for pruning: U0 R1 F2 D3 L4 B5
  var FACEIDX = {U:0,R:1,F:2,D:3,L:4,B:5};
  // Move set that never turns the D face — keeps the bottom layer fixed.
  var NO_D = ['U',"U'",'U2','R',"R'",'R2','F',"F'",'F2','L',"L'",'L2','B',"B'",'B2'];
  function faceOf(m){ return FACEIDX[m[0]]; }
  function sameAxis(a,b){ return a===b || (a%3)===(b%3); } // 0/3,1/4,2/5 share a%3

  // Verified iterative-deepening search: shortest move sequence (from solved-cube
  // move set) after which goal(state) is true. Returns array of move names or null.
  function seek(state, goal, maxDepth, moveSet){
    if (goal(state)) return [];
    var moves = moveSet || ALL;
    var path = [];
    function dfs(s, depth, prevFace){
      if (depth===0) return goal(s);
      for (var i=0;i<moves.length;i++){
        var m = moves[i], f = faceOf(m);
        if (prevFace>=0 && sameAxis(f,prevFace) && f<=prevFace) continue; // prune
        var ns = applyMove(s, MOVES[m]);
        if (depth===1 ? goal(ns) : true){
          if (depth===1){ if(goal(ns)){ path.push(m); return true; } continue; }
          path.push(m);
          if (dfs(ns, depth-1, f)) return true;
          path.pop();
        }
      }
      return false;
    }
    for (var lim=1; lim<=maxDepth; lim++){
      path.length=0;
      if (dfs(state, lim, -1)){ if(seek.maxd<lim) seek.maxd=lim; return path.slice(); }
    }
    seek.misses++;
    return null;
  }
  seek.maxd=0; seek.misses=0;

  // ---- macro search: search over whole algorithms ("triggers") + U setups ----
  // Macros are just a move vocabulary; correctness is enforced by the goal
  // predicate (checked with the real engine), so the search only ever returns
  // sequences that actually achieve the goal. Depth in macro-space is tiny.
  function applySeqRaw(s, seq){ var ns=s; for(var j=0;j<seq.length;j++) ns=applyMove(ns, MOVES[seq[j]]); return ns; }
  // A macro = a named algorithm (or a U setup). { seq, name, desc, isU }.
  function M(seq, name, desc, isU){
    return { seq:(typeof seq==='string'?seq.split(/\s+/).filter(Boolean):seq.slice()), name:name, desc:desc, isU:!!isU };
  }
  function seekMacro(state, goal, macros, maxDepth){
    if (goal(state)) return [];
    var path=[];
    function dfs(s, depth){
      if (goal(s)) return true;
      if (depth===0) return false;
      for (var i=0;i<macros.length;i++){
        path.push(macros[i]);
        if (dfs(applySeqRaw(s, macros[i].seq), depth-1)) return true;
        path.pop();
      }
      return false;
    }
    for (var lim=0; lim<=maxDepth; lim++){
      path.length=0;
      if (dfs(state, lim)) return path.slice(); // sequence of macro objects
    }
    return null;
  }
  // Apply a macro sequence to a Run, grouping leading U-setups with the algorithm
  // they set up, so each group shown to the user is one understandable algorithm.
  function applyGrouped(run, pathMacros){
    if (!pathMacros) return;
    var i=0;
    while (i<pathMacros.length){
      var setup=[];
      while (i<pathMacros.length && pathMacros[i].isU){ setup=setup.concat(pathMacros[i].seq); i++; }
      if (i<pathMacros.length){
        var algo=pathMacros[i]; i++;
        run.group(algo.name, algo.desc);
        run.apply(setup.concat(algo.seq));
      } else if (setup.length){
        run.group('Доворот верхней грани', 'Поворачиваем только верхнюю грань, чтобы выровнять последний слой.');
        run.apply(setup);
      }
    }
  }
  // y-rotation face relabel: rotate an alg around the U axis k quarter-turns.
  var YMAP = {U:'U',D:'D',F:'R',R:'B',B:'L',L:'F'};
  function rot1(m){ return YMAP[m[0]] + m.slice(1); }
  function relabel(seq, k){
    var arr = (typeof seq==='string') ? seq.split(/\s+/).filter(Boolean) : seq.slice();
    for (var t=0;t<k;t++) arr = arr.map(rot1);
    return arr;
  }
  var USETUP = 'Поворачиваем верхнюю грань, чтобы подвести нужный элемент к месту работы.';
  var U3 = [ M('U','Подводка верхом',USETUP,true), M("U'",'Подводка верхом',USETUP,true), M('U2','Подводка верхом',USETUP,true) ];
  // specs: [{seq, name, desc}] — each gets its 4 rotations around U.
  function buildMacros(specs){
    var m = U3.slice();
    specs.forEach(function(sp){ for(var k=0;k<4;k++) m.push(M(relabel(sp.seq,k), sp.name, sp.desc, false)); });
    return m;
  }

  // Collapse consecutive turns of the same face: U U'->(), U U->U2, U U2->U', etc.
  function turnAmt(m){ return m.length===1 ? 1 : (m[1]==="'" ? 3 : 2); }
  function faceTurn(f,a){ a=((a%4)+4)%4; return a===0?[]:a===1?[f]:a===2?[f+'2']:[f+"'"]; }
  function simplify(moves){
    var out = moves.slice(), changed = true;
    while (changed){
      changed = false; var res = [];
      for (var i=0;i<out.length;i++){
        if (res.length && res[res.length-1][0]===out[i][0]){
          var f=out[i][0], a=turnAmt(res[res.length-1])+turnAmt(out[i]);
          res.pop(); faceTurn(f,a).forEach(function(x){ res.push(x); });
          changed = true;
        } else res.push(out[i]);
      }
      out = res;
    }
    return out;
  }

  // ---- piece predicates ----
  function eSolved(s,i){ return s.ep[i]===i && s.eo[i]===0; }
  function cSolved(s,i){ return s.cp[i]===i && s.co[i]===0; }

  // A small driver that accumulates moves and applies them to a working state.
  function Run(state){
    this.s = Cube.clone(state);
    this.phases = [];
    this.cur = null;
    this.curGroup = null;
  }
  Run.prototype.phase = function(name, hint){ this.cur = {name:name, hint:hint, groups:[]}; this.phases.push(this.cur); this.curGroup=null; };
  Run.prototype.group = function(name, desc){ this.curGroup = {name:name, desc:desc, moves:[]}; this.cur.groups.push(this.curGroup); };
  Run.prototype.apply = function(seq){
    if (typeof seq === 'string') seq = seq.split(/\s+/).filter(Boolean);
    if (!this.curGroup) this.group('Ходы', '');
    for (var i=0;i<seq.length;i++){ this.s = applyMove(this.s, MOVES[seq[i]]); this.curGroup.moves.push(seq[i]); }
  };
  // seek a goal and apply it; returns true on success.
  Run.prototype.seekApply = function(goal, maxDepth, moveSet){
    var p = seek(this.s, goal, maxDepth, moveSet);
    if (p===null) return false;
    this.apply(p); return true;
  };

  // ===================== PHASE 1: bottom cross =====================
  // D-layer edges: DR=4, DF=5, DL=6, DB=7. Solve each, locking the previous.
  var CROSS_EDGES = [Cube.E.DF, Cube.E.DR, Cube.E.DB, Cube.E.DL];
  function solveCross(run){
    run.phase('Крест снизу', 'Цель: четыре ребра нижней грани стоят на местах и совпадают с боковыми центрами. Идея: каждое ребро подводим в верхний слой над его местом и опускаем вниз; если оно «перевёрнуто», заводим сбоку. Низ — это опора для всего остального.');
    var done = [];
    for (var k=0;k<CROSS_EDGES.length;k++){
      var t = CROSS_EDGES[k];
      run.group('Ребро '+(k+1)+' из 4', 'Ставим одно ребро нижнего креста: подводим его и опускаем точно между двумя нужными центрами, не сбивая уже поставленные.');
      (function(t, done){
        run.seekApply(function(s){
          if(!eSolved(s,t)) return false;
          for (var d=0; d<done.length; d++) if(!eSolved(s,done[d])) return false;
          return true;
        }, 8);
      })(t, done.slice());
      done.push(t);
    }
  }

  // ===================== PHASE 2: bottom corners =====================
  // D-layer corners: DFR=4, DLF=5, DBL=6, DRB=7. First layer complete after this.
  var CROSS_ALL = [4,5,6,7]; // edge slots
  var DCORNERS = [Cube.C.DFR, Cube.C.DLF, Cube.C.DBL, Cube.C.DRB];
  var CDESC = 'Триггер «достань-вставь»: выводим угол наверх и заводим его в нижнее гнездо поворотом боковой грани туда — и обратно. Повтор того же триггера разворачивает угол правильным цветом вниз.';
  var CORNER_MACROS = buildMacros([
    {seq:"R U R'",  name:'Вставка угла', desc:CDESC},
    {seq:"R U' R'", name:'Вставка угла', desc:CDESC},
    {seq:"R U2 R'", name:'Вставка угла', desc:CDESC}
  ]);
  function solveCorners(run){
    run.phase('Углы снизу', 'Цель: достроить первый слой — поставить 4 нижних угла так, чтобы их три цвета совпали с тремя гранями. Идея: нужный угол выводим в верхний слой над его гнездом и «триггером» опускаем вниз нужной стороной.');
    var done = [];
    for (var k=0;k<DCORNERS.length;k++){
      var t = DCORNERS[k];
      (function(t, done){
        var seq = seekMacro(run.s, function(s){
          if(!cSolved(s,t)) return false;
          for (var e=0;e<CROSS_ALL.length;e++) if(!eSolved(s,CROSS_ALL[e])) return false;
          for (var d=0; d<done.length; d++) if(!cSolved(s,done[d])) return false;
          return true;
        }, CORNER_MACROS, 6);
        applyGrouped(run, seq);
      })(t, done.slice());
      done.push(t);
    }
  }

  // ===================== PHASE 3: middle-layer edges =====================
  // Middle edges: FR=8, FL=9, BL=10, BR=11. Two layers complete after this.
  var FIRST_LAYER_E = [4,5,6,7], FIRST_LAYER_C = [4,5,6,7];
  var MIDDLE = [Cube.E.FR, Cube.E.FL, Cube.E.BR, Cube.E.BL];
  var MR = 'Ребро стоит наверху (без верхнего цвета). Уводим его поворотом верха в сторону, затем «вилкой» из боковой и фронтальной граней опускаем в средний слой вправо, по дороге восстанавливая нижний слой.';
  var ML = 'То же зеркально: заводим ребро в средний слой влево.';
  var MIDDLE_MACROS = buildMacros([
    {seq:"U R U' R' U' F' U F", name:'Завод ребра вправо', desc:MR},
    {seq:"U' L' U L U F U' F'", name:'Завод ребра влево',  desc:ML}
  ]);
  function solveMiddle(run){
    run.phase('Средний слой', 'Цель: поставить 4 ребра среднего слоя — после этого собраны два слоя из трёх. Идея: ребро без верхнего цвета (оно «принадлежит» среднему слою) подводим наверх и заводим вбок вправо или влево, не разрушая нижний слой.');
    var done = [];
    for (var k=0;k<MIDDLE.length;k++){
      var t = MIDDLE[k];
      (function(t, done){
        var seq = seekMacro(run.s, function(s){
          if(!eSolved(s,t)) return false;
          for (var e=0;e<FIRST_LAYER_E.length;e++) if(!eSolved(s,FIRST_LAYER_E[e])) return false;
          for (var c=0;c<FIRST_LAYER_C.length;c++) if(!cSolved(s,FIRST_LAYER_C[c])) return false;
          for (var d=0; d<done.length; d++) if(!eSolved(s,done[d])) return false;
          return true;
        }, MIDDLE_MACROS, 6);
        applyGrouped(run, seq);
      })(t, done.slice());
      done.push(t);
    }
  }

  // ===================== PHASES 4-7: last layer =====================
  function invSeq(seq){
    if (typeof seq==='string') seq = seq.split(/\s+/).filter(Boolean);
    var out=[]; for (var i=seq.length-1;i>=0;i--){ var m=seq[i]; out.push(m.length===1?m+"'":(m[1]==="'"?m[0]:m)); }
    return out;
  }
  var ULL = [4,5,6,7,8,9,10,11], CLL = [4,5,6,7]; // first-two-layer slots to keep
  function f2l(s){
    for (var e=0;e<ULL.length;e++) if(!eSolved(s,ULL[e])) return false;
    for (var c=0;c<CLL.length;c++) if(!cSolved(s,CLL[c])) return false;
    return true;
  }
  function crossUp(s){ return s.eo[0]===0&&s.eo[1]===0&&s.eo[2]===0&&s.eo[3]===0; }
  function cornersUp(s){ return s.co[0]===0&&s.co[1]===0&&s.co[2]===0&&s.co[3]===0; }
  function cornersPlaced(s){ return s.cp[0]===0&&s.cp[1]===1&&s.cp[2]===2&&s.cp[3]===3; }

  var OLLE  = M("F R U R' U' F'", 'Поворот рёбер (F R U R′ U′ F′)', 'Меняет ориентацию верхних рёбер, не трогая нижние слои. Узор развивается по шагам: точка → уголок → линия → крест. Применяется 1–2 раза с доворотом верха между ними.');
  var SUNE  = M("R U R' U R U2 R'", 'Разворот углов (Sune)', 'Доворачивает верхние углы так, чтобы их верхний цвет смотрел вверх. Углы при этом могут переехать — это нормально, их места поправит следующий этап.');
  var ANTI  = M("R U2 R' U' R U' R'", 'Разворот углов (анти-Sune)', 'Тот же приём, что Sune, но крутит углы в другую сторону. Хватает 1–2 повторов, чтобы вся верхняя грань стала одного цвета.');
  var APERM = M("R' F R' B2 R F' R' B2 R2", 'Перестановка углов (A-perm)', 'Переставляет по кругу три верхних угла на свои места, НЕ меняя их разворот. Один цикл ставит как минимум один угол; повтор с доворотом доводит остальные.');
  var UEDGE = M("R U' R U R U R U' R' U' R2", 'Перестановка рёбер (U-perm)', 'Гоняет по кругу три верхних ребра. Углы уже стоят — это финальный штрих, после него кубик собран.');
  var OLLE_MACROS = U3.concat([OLLE]);
  var OLLC_MACROS = U3.concat([SUNE, ANTI]);
  var PERMC_MACROS = U3.concat([APERM, M(invSeq(APERM.seq), APERM.name, 'Тот же цикл трёх углов, но в обратную сторону.')]);
  var PERME_MACROS = U3.concat([UEDGE, M(invSeq(UEDGE.seq), UEDGE.name, 'Тот же цикл трёх рёбер, но в обратную сторону.')]);

  function solveLastLayer(run){
    run.phase('Крест сверху', 'Цель: верхние рёбра развёрнуты верхним цветом вверх — получается «крест». Здесь важна только ОРИЕНТАЦИЯ рёбер, не их места. Алгоритм F R U R′ U′ F′ переводит узор точка→уголок→линия→крест.');
    applyGrouped(run, seekMacro(run.s, function(s){ return crossUp(s) && f2l(s); }, OLLE_MACROS, 6));

    run.phase('Разворот верхних углов', 'Цель: вся верхняя грань — одного цвета (углы развёрнуты верхним цветом вверх). Места углов пока не важны. Делается приёмом Sune / анти-Sune.');
    applyGrouped(run, seekMacro(run.s, function(s){ return cornersUp(s) && crossUp(s) && f2l(s); }, OLLC_MACROS, 7));

    run.phase('Расстановка верхних углов', 'Цель: углы встают на свои места (между правильными боковыми цветами), разворот сохраняется. Цикл из трёх углов (A-perm) + доворот верха.');
    applyGrouped(run, seekMacro(run.s, function(s){ return cornersPlaced(s) && cornersUp(s) && crossUp(s) && f2l(s); }, PERMC_MACROS, 6));

    run.phase('Расстановка верхних рёбер', 'Цель: последние 3–4 ребра встают по местам — и кубик собран! Цикл из трёх рёбер (U-perm).');
    applyGrouped(run, seekMacro(run.s, function(s){ return Cube.isSolved(s); }, PERME_MACROS, 6));
  }

  function solve(state){
    var run = new Run(state);
    solveCross(run);
    solveCorners(run);
    solveMiddle(run);
    solveLastLayer(run);
    // Tidy moves inside each group (cancel redundant same-face turns), keeping
    // group/algorithm boundaries intact. Drop empty groups and empty phases.
    var flat = [], phases = [];
    run.phases.forEach(function(p){
      var groups = [];
      p.groups.forEach(function(g){
        g.moves = simplify(g.moves);
        if (g.moves.length){ groups.push(g); g.moves.forEach(function(m){ flat.push(m); }); }
      });
      if (groups.length){ p.groups = groups; phases.push(p); }
    });
    return { phases: phases, moves: flat, state: run.s };
  }

  var api = { seek:seek, solve:solve, solveCross:solveCross, solveCorners:solveCorners, solveMiddle:solveMiddle, Run:Run, eSolved:eSolved, cSolved:cSolved };
  root.Solver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);


// ---------- self-test / benchmark (node solver.js) ----------
if (typeof require !== 'undefined' && require.main === module) {
  var Cube = require('./cube.js');
  var Solver = module.exports;
  var rng = 99; function rnd(m){ rng=(rng*1103515245+12345)&0x7fffffff; return rng%m; }
  function scramble(n){ var s=Cube.solved(); for(var i=0;i<n;i++) s=Cube.applyMove(s,Cube.MOVES[Cube.ALL_MOVES[rnd(18)]]); return s; }

  var N=2000, fails=0, maxLen=0, sumLen=0, t0=Date.now(), worst=0, worstI=-1;
  for (var i=0;i<N;i++){
    var s=scramble(30);
    var tc=Date.now();
    var r=Solver.solve(s);
    var dtc=Date.now()-tc; if(dtc>worst){worst=dtc;worstI=i;}
    if(!Cube.isSolved(r.state)){ fails++; if(fails<=3) console.log('  FAIL #'+i+' moves='+r.moves.length); }
    if (r.moves.length>maxLen) maxLen=r.moves.length;
    sumLen+=r.moves.length;
  }
  var dt=Date.now()-t0;
  console.log('SOLVE: '+(N-fails)+'/'+N+' ok, fails='+fails+', avgMoves='+(sumLen/N).toFixed(1)+', maxMoves='+maxLen+', total='+dt+'ms, worstCube='+worst+'ms(#'+worstI+')');
}
