/* cube.js — Rubik's cube model, move engine, facelet I/O, validation, LBL solver.
 * Works in the browser (attaches to window.Cube) and in Node (module.exports),
 * so the same code can be unit-tested with `node cube.js`.
 *
 * Cubie model (Kociemba conventions)
 * ---------------------------------
 * Corners 0..7: URF UFL ULB UBR DFR DLF DBL DRB
 * Edges   0..11: UR UF UL UB DR DF DL DB FR FL BL BR
 * State = { cp[8], co[8], ep[12], eo[12] }
 *   cp[i] = which corner cubie sits in slot i; co[i] = its twist (0..2)
 *   ep[i] = which edge   cubie sits in slot i; eo[i] = its flip  (0..1)
 */
(function (root) {
  'use strict';

  // ---- Corner / edge name indices (for readability) ----
  var C = { URF:0, UFL:1, ULB:2, UBR:3, DFR:4, DLF:5, DBL:6, DRB:7 };
  var E = { UR:0, UF:1, UL:2, UB:3, DR:4, DF:5, DL:6, DB:7, FR:8, FL:9, BL:10, BR:11 };

  function solved() {
    return {
      cp: [0,1,2,3,4,5,6,7],
      co: [0,0,0,0,0,0,0,0],
      ep: [0,1,2,3,4,5,6,7,8,9,10,11],
      eo: [0,0,0,0,0,0,0,0,0,0,0,0]
    };
  }
  function clone(s){ return { cp:s.cp.slice(), co:s.co.slice(), ep:s.ep.slice(), eo:s.eo.slice() }; }

  // ---- Base quarter-turn moves (clockwise) as cubie permutations ----
  var BASE = {
    U: { cp:[3,0,1,2,4,5,6,7], co:[0,0,0,0,0,0,0,0],
         ep:[3,0,1,2,4,5,6,7,8,9,10,11], eo:[0,0,0,0,0,0,0,0,0,0,0,0] },
    R: { cp:[4,1,2,0,7,5,6,3], co:[2,0,0,1,1,0,0,2],
         ep:[8,1,2,3,11,5,6,7,4,9,10,0], eo:[0,0,0,0,0,0,0,0,0,0,0,0] },
    F: { cp:[1,5,2,3,0,4,6,7], co:[1,2,0,0,2,1,0,0],
         ep:[0,9,2,3,4,8,6,7,1,5,10,11], eo:[0,1,0,0,0,1,0,0,1,1,0,0] },
    D: { cp:[0,1,2,3,5,6,7,4], co:[0,0,0,0,0,0,0,0],
         ep:[0,1,2,3,5,6,7,4,8,9,10,11], eo:[0,0,0,0,0,0,0,0,0,0,0,0] },
    L: { cp:[0,2,6,3,4,1,5,7], co:[0,1,2,0,0,2,1,0],
         ep:[0,1,10,3,4,5,9,7,8,2,6,11], eo:[0,0,0,0,0,0,0,0,0,0,0,0] },
    B: { cp:[0,1,3,7,4,5,2,6], co:[0,0,1,2,0,0,2,1],
         ep:[0,1,2,11,4,5,6,10,8,9,3,7], eo:[0,0,0,1,0,0,0,1,0,0,1,1] }
  };

  // Apply move M on top of state S: result = M after S.
  function applyMove(s, M) {
    var r = { cp:new Array(8), co:new Array(8), ep:new Array(12), eo:new Array(12) };
    for (var i=0;i<8;i++){ r.cp[i]=s.cp[M.cp[i]]; r.co[i]=(s.co[M.cp[i]]+M.co[i])%3; }
    for (var j=0;j<12;j++){ r.ep[j]=s.ep[M.ep[j]]; r.eo[j]=(s.eo[M.ep[j]]+M.eo[j])%2; }
    return r;
  }

  // ---- Notation: 18 moves U U2 U' R R2 R' F F2 F' D D2 D' L L2 L' B B2 B' ----
  var FACES = ['U','R','F','D','L','B'];
  // Precompute the 3 variants (q=1,2,3 turns) of each base move.
  var MOVES = {}; // name -> cubie perm
  FACES.forEach(function(f){
    var m1 = BASE[f];
    var m2 = applyMove(m1, m1);
    var m3 = applyMove(m2, m1);
    MOVES[f] = m1; MOVES[f+'2'] = m2; MOVES[f+"'"] = m3;
  });
  var ALL_MOVES = ['U',"U'",'U2','R',"R'",'R2','F',"F'",'F2','D',"D'",'D2','L',"L'",'L2','B',"B'",'B2'];

  // Apply a sequence given as array or space string of move names.
  function applySeq(s, seq) {
    if (typeof seq === 'string') seq = seq.split(/\s+/).filter(Boolean);
    var st = s;
    for (var i=0;i<seq.length;i++) st = applyMove(st, MOVES[seq[i]]);
    return st;
  }
  function isSolved(s){
    for (var i=0;i<8;i++){ if(s.cp[i]!==i||s.co[i]!==0) return false; }
    for (var j=0;j<12;j++){ if(s.ep[j]!==j||s.eo[j]!==0) return false; }
    return true;
  }

  // ---- Facelets (54 stickers), URFDLB order, each face read row-major ----
  // global index: U 0..8, R 9..17, F 18..26, D 27..35, L 36..44, B 45..53
  var CORNER_FL = [
    [8,9,20],[6,18,38],[0,36,47],[2,45,11],
    [29,26,15],[27,44,24],[33,53,42],[35,17,51]
  ];
  var EDGE_FL = [
    [5,10],[7,19],[3,37],[1,46],[32,16],[28,25],
    [30,43],[34,52],[23,12],[21,41],[50,39],[48,14]
  ];
  // The face-letter colors of each slot's stickers, in the same order as *_FL.
  var CORNER_COL = ['URF','UFL','ULB','UBR','DFR','DLF','DBL','DRB'].map(function(s){return s.split('');});
  var EDGE_COL   = ['UR','UF','UL','UB','DR','DF','DL','DB','FR','FL','BL','BR'].map(function(s){return s.split('');});
  var CENTER_FL = [4,13,22,31,40,49]; // U R F D L B centers

  // state -> array[54] of face letters ('U'..'B')
  function toFacelets(s){
    var fc = new Array(54);
    for (var f=0; f<6; f++) fc[CENTER_FL[f]] = FACES[f];
    for (var i=0;i<8;i++){
      var c=s.cp[i], o=s.co[i];
      for (var k=0;k<3;k++) fc[CORNER_FL[i][(k+o)%3]] = CORNER_COL[c][k];
    }
    for (var j=0;j<12;j++){
      var e=s.ep[j], p=s.eo[j];
      for (var m=0;m<2;m++) fc[EDGE_FL[j][(m+p)%2]] = EDGE_COL[e][m];
    }
    return fc;
  }

  // array[54] of face letters -> state. Throws Error(reason) if pieces don't match.
  function fromFacelets(fc){
    var st = { cp:new Array(8), co:new Array(8), ep:new Array(12), eo:new Array(12) };
    var cset = CORNER_COL.map(function(a){return a.slice().sort().join('');});
    var eset = EDGE_COL.map(function(a){return a.slice().sort().join('');});
    var i,k;
    for (i=0;i<8;i++){
      var cols = CORNER_FL[i].map(function(p){return fc[p];});
      var key = cols.slice().sort().join('');
      var c = cset.indexOf(key);
      if (c<0) throw new Error('Invalid corner at slot '+i+' ('+cols.join('')+')');
      var o=-1;
      for (k=0;k<3;k++){ if (cols[(0+k)%3]===CORNER_COL[c][0] && cols[(1+k)%3]===CORNER_COL[c][1] && cols[(2+k)%3]===CORNER_COL[c][2]){ o=k; break; } }
      if (o<0) throw new Error('Bad corner orientation at slot '+i);
      st.cp[i]=c; st.co[i]=o;
    }
    for (i=0;i<12;i++){
      var ec = EDGE_FL[i].map(function(p){return fc[p];});
      var ekey = ec.slice().sort().join('');
      var e = eset.indexOf(ekey);
      if (e<0) throw new Error('Invalid edge at slot '+i+' ('+ec.join('')+')');
      var p2 = (ec[0]===EDGE_COL[e][0] && ec[1]===EDGE_COL[e][1]) ? 0
             : (ec[0]===EDGE_COL[e][1] && ec[1]===EDGE_COL[e][0]) ? 1 : -1;
      if (p2<0) throw new Error('Bad edge orientation at slot '+i);
      st.ep[i]=e; st.eo[i]=p2;
    }
    return st;
  }

  // Is this a physically solvable cube? Returns {ok, reason}.
  function validateState(s){
    var i, seen, sum;
    seen={}; for(i=0;i<8;i++) seen[s.cp[i]]=1; if(Object.keys(seen).length!==8) return {ok:false, reason:'Угловой элемент повторяется или отсутствует.'};
    seen={}; for(i=0;i<12;i++) seen[s.ep[i]]=1; if(Object.keys(seen).length!==12) return {ok:false, reason:'Реберный элемент повторяется или отсутствует.'};
    sum=0; for(i=0;i<8;i++) sum+=s.co[i]; if(sum%3!==0) return {ok:false, reason:'Невозможный разворот угла — один угол повёрнут вокруг своей оси. Проверьте углы.'};
    sum=0; for(i=0;i<12;i++) sum+=s.eo[i]; if(sum%2!==0) return {ok:false, reason:'Невозможный переворот ребра — одно ребро перевёрнуто. Проверьте рёбра.'};
    // permutation parity of corners must equal that of edges
    function parity(arr){ var p=0; for(var a=0;a<arr.length;a++) for(var b=a+1;b<arr.length;b++) if(arr[a]>arr[b]) p^=1; return p; }
    if (parity(s.cp)!==parity(s.ep)) return {ok:false, reason:'Два элемента переставлены местами — такая позиция недостижима. Проверьте пару элементов.'};
    return {ok:true, reason:''};
  }

  var api = { C:C, E:E, FACES:FACES, BASE:BASE, MOVES:MOVES, ALL_MOVES:ALL_MOVES,
              CORNER_FL:CORNER_FL, EDGE_FL:EDGE_FL, CENTER_FL:CENTER_FL,
              solved:solved, clone:clone, applyMove:applyMove, applySeq:applySeq, isSolved:isSolved,
              toFacelets:toFacelets, fromFacelets:fromFacelets, validateState:validateState };
  root.Cube = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);


// ---------- self-test (node cube.js) ----------
if (typeof require !== 'undefined' && require.main === module) {
  var Cube = module.exports;
  var ok = true, n = 0;
  function check(name, cond){ n++; if(!cond){ ok=false; console.log('FAIL: '+name);} }

  // Each quarter turn to the 4th power is identity.
  Cube.FACES.forEach(function(f){
    check(f+'^4 = identity', Cube.isSolved(Cube.applySeq(Cube.solved(), [f,f,f,f])));
  });
  // X X' = identity for every move.
  Cube.ALL_MOVES.forEach(function(m){
    var inv = m.length===1 ? m+"'" : (m[1]==="'" ? m[0] : m); // X->X', X'->X, X2->X2
    check(m+' '+inv+' = identity', Cube.isSolved(Cube.applySeq(Cube.solved(), [m,inv])));
  });
  // Sexy move (R U R' U') x6 = identity.
  var s = Cube.solved();
  for (var i=0;i<6;i++) s = Cube.applySeq(s, "R U R' U'");
  check("(R U R' U')x6 = identity", Cube.isSolved(s));
  // Sune x6? Actually (R U2 R' U' R U' R') is a 3-cycle; do it... skip. Test U2=U U.
  check('U2 == U U', JSON.stringify(Cube.applySeq(Cube.solved(),['U2']))===JSON.stringify(Cube.applySeq(Cube.solved(),['U','U'])));
  check("R2 == R R", JSON.stringify(Cube.applySeq(Cube.solved(),['R2']))===JSON.stringify(Cube.applySeq(Cube.solved(),['R','R'])));
  // A scramble and its exact inverse returns to solved.
  var scr = "R U R' U' F2 D L' B R2 D'".split(' ');
  var inv = scr.slice().reverse().map(function(m){ return m.length===1?m+"'":(m[1]==="'"?m[0]:m); });
  check('scramble + inverse = identity', Cube.isSolved(Cube.applySeq(Cube.applySeq(Cube.solved(),scr),inv)));

  // solved state -> facelets must be each face's own letter, 9 each.
  var solvedFc = Cube.toFacelets(Cube.solved());
  check('solved facelets = UUUUUUUUU...', solvedFc.join('')==='UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB');
  // round-trip on many random scrambles: state -> facelets -> state.
  var rng = 12345;
  function rnd(m){ rng = (rng*1103515245 + 12345) & 0x7fffffff; return rng % m; }
  var rtOk = true, valOk = true;
  for (var t=0;t<300;t++){
    var st = Cube.solved(), seq=[];
    for (var q=0;q<25;q++){ var mv=Cube.ALL_MOVES[rnd(18)]; seq.push(mv); st=Cube.applyMove(st, Cube.MOVES[mv]); }
    var back = Cube.fromFacelets(Cube.toFacelets(st));
    if (JSON.stringify(back)!==JSON.stringify(st)) rtOk=false;
    if (!Cube.validateState(st).ok) valOk=false;
  }
  check('facelet round-trip (300 scrambles)', rtOk);
  check('all reachable scrambles validate as solvable', valOk);
  // a single flipped edge must be rejected.
  var bad = Cube.solved(); bad.eo[0]=1;
  check('flipped edge rejected', !Cube.validateState(bad).ok);
  var bad2 = Cube.solved(); bad2.co[0]=1;
  check('twisted corner rejected', !Cube.validateState(bad2).ok);
  var bad3 = Cube.solved(); var tmp=bad3.ep[0]; bad3.ep[0]=bad3.ep[1]; bad3.ep[1]=tmp;
  check('single swap rejected', !Cube.validateState(bad3).ok);

  console.log((ok?'ALL PASS':'SOME FAILED')+' ('+n+' checks)');
  process.exit(ok?0:1);
}
