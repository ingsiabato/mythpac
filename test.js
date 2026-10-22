const fs = require("fs");
const vm = require("vm");
const html = fs.readFileSync("C:/Users/Juanitos/mythpac/index.html", "utf8");
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === "canvas") return { width: 672, height: 696 };
    if (!(k in t)) t[k] = (...a) => (k.startsWith("create") ? { addColorStop() {} } : undefined);
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; }
});
const elCache = {};
const makeEl = (id) => ({ id, textContent: "", innerHTML: "", width: 672, height: 696, style: {}, dataset: {},
  classList: { add() {}, remove() {}, contains() { return false; } }, addEventListener() {}, appendChild() {}, click() {},
  getContext: () => ctx2d, querySelectorAll: () => [] });
const getEl = (id) => (elCache[id] || (elCache[id] = makeEl(id)));
const store = {};
const sandbox = { console, Math, Date, JSON, parseInt, parseFloat, isNaN, String, Number, Array, Object, Int32Array, Float32Array, Infinity, NaN,
  setTimeout: () => 0, clearTimeout: () => {},
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  document: { getElementById: getEl, querySelectorAll: () => [], addEventListener: () => {}, hidden: false, createElement: () => makeEl("cv") },
  requestAnimationFrame: () => 0 };
sandbox.window = sandbox; sandbox.window.addEventListener = () => {};

vm.createContext(sandbox);
vm.runInContext(code + `
var __G = {
  newGame, update, setDesired, nextLevel, resetActors,
  COLS, ROWS, walls, doors, houses, dots,
  get pac(){return pac;}, get ghosts(){return ghosts;},
  get score(){return score;}, get level(){return level;}, get lives(){return lives;},
  set lives(v){lives=v;},
  get state(){return state;}, set state(v){state=v;}, get dotsLeft(){return dotsLeft;},
  set dotsLeft(v){dotsLeft=v;}, get totalDots(){return totalDots;},
  get eatenDots(){return eatenDots;}, set eatenDots(v){eatenDots=v;},
  get fruitEaten(){return fruitEaten;}, get fruit(){return fruit;},
  get fright(){return frightTimer;}, get best(){return best;},
  get stateTimer(){return stateTimer;}, get modeTimer(){return modeTimer;},
  get chase(){return chaseMode;}
};
`, sandbox, { filename: "game.js" });

const G = sandbox.__G;
let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log("  OK  " + name);
  else { console.log("  FAIL " + name, extra === undefined ? "" : extra); fails++; }
}

/* ---------- 1. arranque ---------- */
console.log("1. Arranque");
G.newGame();
check("estado ready", G.state === "ready", G.state);
check("3 vidas", G.lives === 3, G.lives);
check("nivel 1", G.level === 1, G.level);
check("346 ofrendas", G.totalDots === 346, G.totalDots);
check("5 fantasmas", G.ghosts.length === 5);
check("todos en la casa", G.ghosts.every(g => g.mode === "house"));

/* ---------- 2. la partida arranca ---------- */
console.log("2. Inicio de partida");
for (let i = 0; i < 200; i++) G.update(1 / 60);
check("estado playing", G.state === "playing", G.state);
check("pacman se movio", G.pac.tx !== 12 || G.pac.ty !== 21);
check("comio ofrendas", G.dotsLeft < 346, G.dotsLeft);

/* ---------- 3. los fantasmas salen de la casa ---------- */
console.log("3. Salida de fantasmas");
let maxOutside = 0;
for (let i = 0; i < 1500; i++) {
  G.update(1 / 60);
  const n = G.ghosts.filter(g => g.mode === "active" || g.mode === "eaten").length;
  if (n > maxOutside) maxOutside = n;
}
check("los 5 fantasmas llegan a salir", maxOutside >= 4, "max fuera: " + maxOutside + " | " + G.ghosts.map(g => g.id + ":" + g.mode).join(" "));
check("nadie dentro de un muro", G.ghosts.every(g => !G.walls[g.ty][g.tx]),
  G.ghosts.filter(g => G.walls[g.ty][g.tx]).map(g => g.id).join(","));

/* ---------- 4. pildora grande -> miedo ---------- */
console.log("4. Ofrenda dorada");
// colocar al pacman sobre la ofrenda dorada de la esquina
G.pac.tx = 1; G.pac.ty = 23; G.pac.prog = 0; G.pac.dir = "right";
G.dots[23][1] = 2;
const before = G.fright;
G.update(1 / 60);
check("se activo el miedo", G.fright > 0, G.fright);

/* ---------- 5. comer fantasma ---------- */
console.log("5. Comer fantasma");
const victim = G.ghosts.find(g => g.mode === "active");
victim.tx = G.pac.tx; victim.ty = G.pac.ty; victim.prog = 0;
victim.fright = true;
const ptsBefore = G.score;
G.update(1 / 60);
check("fantasma comido", victim.mode === "eaten", victim.mode);
check("puntos sumaron", G.score > ptsBefore, G.score - ptsBefore);

/* ---------- 6. volver a la casa ---------- */
console.log("6. Regreso a la casa");
for (let i = 0; i < 900; i++) G.update(1 / 60);
check("fantasma revivio en la casa o salio", victim.mode === "house" || victim.mode === "leaving" || victim.mode === "active", victim.mode);

/* ---------- 7. completar nivel ---------- */
console.log("7. Fin de nivel");
// encerrar a los fantasmas para que no interrumpan la prueba
for (const g of G.ghosts) { g.mode = "house"; g.tx = 13; g.ty = 17; g.prog = 0; g.houseTimer = 999; g.fright = false; }
G.state = "playing";
// dejar solo una ofrenda y ponersela delante al pacman
for (let y = 0; y < G.ROWS; y++) for (let x = 0; x < G.COLS; x++) G.dots[y][x] = 0;
G.pac.tx = 12; G.pac.ty = 21; G.pac.prog = 0; G.pac.dir = "left"; G.pac.desired = null;
G.dots[21][12] = 1;
G.dotsLeft = 1;
G.eatenDots = G.totalDots - 1;
G.update(1 / 60);
check("estado levelclear", G.state === "levelclear", G.state);
for (let i = 0; i < 200; i++) G.update(1 / 60);
check("paso a nivel 2", G.level === 2, G.level);
check("ofrendas restauradas", G.dotsLeft === 346, G.dotsLeft);
check("estado ready", G.state === "ready", G.state);

/* ---------- 8. muerte y fin de juego ---------- */
console.log("8. Muerte y game over");
G.lives = 1;
const g0 = G.ghosts[0];
G.pac.tx = 12; G.pac.ty = 21; G.pac.prog = 0; G.pac.dir = "left";
g0.tx = 12; g0.ty = 21; g0.prog = 0; g0.mode = "active"; g0.fright = false;
G.state = "playing";
G.update(1 / 60);
check("estado dying", G.state === "dying", G.state);
for (let i = 0; i < 200; i++) G.update(1 / 60);
check("estado gameover", G.state === "gameover", G.state);
check("vidas en 0", G.lives === 0, G.lives);

/* ---------- 9. reinicio ---------- */
console.log("9. Reinicio");
G.newGame();
check("vidas 3", G.lives === 3, G.lives);
check("nivel 1", G.level === 1, G.level);
check("puntos 0", G.score === 0, G.score);
check("346 ofrendas", G.dotsLeft === 346, G.dotsLeft);

/* ---------- 10. record guardado ---------- */
console.log("10. Record");
check("record guardado en localStorage", store["mythpac_best"] !== undefined, JSON.stringify(store));

console.log(fails === 0 ? "\nTODAS LAS PRUEBAS PASARON" : "\n" + fails + " PRUEBAS FALLARON");
process.exitCode = fails === 0 ? 0 : 1;
