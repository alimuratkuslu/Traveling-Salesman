const canvas = document.getElementById('grid-canvas');
const ctx = canvas.getContext('2d');
const GRID_W = 100, GRID_H = 100, CELL = canvas.width / GRID_W;

let customers = [], warehouse = null, blocks = [];
let mode = 'customer', currentRoute = [], bestRoute = [];
let T, coolingRate, delay, iter, currentDist, bestDist, timer;
let distMatrix = [];
let pathMatrix = [];
let saRunning = false;

['warehouse','customer','block'].forEach(m => {
  document.getElementById('mode-' + m)
    .onclick = () => mode = m;
});
document.getElementById('start').onclick = startSA;
document.getElementById('reset').onclick = resetAll;

canvas.onclick = e => {
  saRunning = false;
  const r = canvas.getBoundingClientRect();
  const cx = Math.floor((e.clientX - r.left) / CELL);
  const cy = Math.floor((e.clientY - r.top) / CELL);
  if (mode === 'customer') customers.push({x:cx,y:cy});
  else if (mode === 'warehouse') warehouse = {x:cx,y:cy};
  else if (mode === 'block') {
    const i = blocks.findIndex(b=>b.x===cx&&b.y===cy);
    if (i===-1) blocks.push({x:cx,y:cy}); else blocks.splice(i,1);
  }
  if (warehouse && customers.length) {
    currentRoute = customers.map((_,i)=>i);
    bestRoute = currentRoute.slice();
    computeDistances();
    currentDist = bestDist = totalDistance(currentRoute);
    document.getElementById('dist').textContent = bestDist;
  }
  draw();
};

let isDragging = false;
canvas.addEventListener('mousedown', e => {
  if (mode === 'block') { isDragging = true; handleBlockDrag(e); }
});
canvas.addEventListener('mousemove', e => {
  if (mode === 'block' && isDragging) handleBlockDrag(e);
});
canvas.addEventListener('mouseup', () => { isDragging = false; });
canvas.addEventListener('mouseleave', () => { isDragging = false; });

function handleBlockDrag(e) {
  saRunning = false;
  const r = canvas.getBoundingClientRect();
  const cx = Math.floor((e.clientX - r.left) / CELL);
  const cy = Math.floor((e.clientY - r.top) / CELL);
  if (cx<0||cx>=GRID_W||cy<0||cy>=GRID_H) return;
  if (!blocks.find(b=>b.x===cx&&b.y===cy)) {
    blocks.push({x:cx,y:cy});
    if (warehouse && customers.length) computeDistances();
    draw();
  }
}

function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawGrid();
  drawBlocks();
  if (saRunning && bestRoute.length) drawRoute(bestRoute);
  drawPoints();
}

function drawGrid() {
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
  for (let i=0; i<=GRID_W; i++){
    ctx.beginPath(); ctx.moveTo(i*CELL,0);
    ctx.lineTo(i*CELL,canvas.height); ctx.stroke();
  }
  for (let j=0; j<=GRID_H; j++){
    ctx.beginPath(); ctx.moveTo(0,j*CELL);
    ctx.lineTo(canvas.width,j*CELL); ctx.stroke();
  }
}

function drawBlocks() {
  ctx.fillStyle = '#444';
  blocks.forEach(b=> ctx.fillRect(b.x*CELL,b.y*CELL,CELL,CELL));
}

function drawPoints() {
  if (warehouse) {
    ctx.fillStyle = '#007bff';
    ctx.beginPath();
    ctx.arc((warehouse.x+0.5)*CELL,(warehouse.y+0.5)*CELL,CELL/3,0,2*Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = '#dc3545';
  customers.forEach(c=>{
    ctx.beginPath();
    ctx.arc((c.x+0.5)*CELL,(c.y+0.5)*CELL,CELL/3,0,2*Math.PI);
    ctx.fill();
  });
}

function drawRoute(route) {
  const fullPath = [];
  let prevIdx = 0;
  route.forEach(i => {
    fullPath.push(...pathMatrix[prevIdx][i + 1]);
    prevIdx = i + 1;
  });
  fullPath.push(...pathMatrix[prevIdx][0]);

  ctx.strokeStyle = '#28a745';
  ctx.lineWidth = CELL * 0.2;
  ctx.beginPath();
  fullPath.forEach((pt, idx) => {
    const x = (pt.x + 0.5) * CELL;
    const y = (pt.y + 0.5) * CELL;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const arrowInterval = Math.max(1, Math.floor(fullPath.length / 6));
  for (let k = arrowInterval; k < fullPath.length; k += arrowInterval) {
    drawArrowAt(fullPath[k - 1], fullPath[k], '#28a745', 0.5);
  }

  if (route.length) {
    const exitPath = pathMatrix[0][route[0] + 1];
    if (exitPath.length >= 2) drawArrowAt(exitPath[0], exitPath[1], '#007bff', 2);

    const returnPath = pathMatrix[route[route.length - 1] + 1][0];
    if (returnPath.length >= 2) {
      const p = returnPath[returnPath.length - 2];
      const w = returnPath[returnPath.length - 1];
      drawArrowAt(p, w, '#dc3545', 2);
    }
  }
}

function computeDistances() {
  const pts = [warehouse, ...customers];
  const n = pts.length;
  distMatrix = Array.from({length:n}, () => Array(n).fill(Infinity));
  pathMatrix = Array.from({length:n}, () => Array(n).fill([]));
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let i=0; i<n; i++) {
    const src = pts[i];
    const dist = Array.from({length:GRID_W},()=>Array(GRID_H).fill(Infinity));
    const prev = Array.from({length:GRID_W},()=>Array(GRID_H).fill(null));
    const q = [{x:src.x,y:src.y}];
    dist[src.x][src.y] = 0;
    while(q.length) {
      const {x,y} = q.shift();
      for (const [dx,dy] of dirs) {
        const nx=x+dx, ny=y+dy;
        if (nx<0||nx>=GRID_W||ny<0||ny>=GRID_H) continue;
        if (dist[nx][ny] !== Infinity) continue;
        if (blocks.some(b=>b.x===nx&&b.y===ny)) continue;
        dist[nx][ny] = dist[x][y] + 1;
        prev[nx][ny] = {x,y};
        q.push({x:nx,y:ny});
      }
    }
    for (let j=0; j<n; j++) {
      const dst = pts[j];
      distMatrix[i][j] = dist[dst.x][dst.y];
      const path = [];
      if (dist[dst.x][dst.y] !== Infinity) {
        let cx = dst.x, cy = dst.y;
        while (!(cx===src.x && cy===src.y)) {
          path.push({x:cx,y:cy});
          const p = prev[cx][cy];
          cx = p.x; cy = p.y;
        }
        path.push({x:src.x,y:src.y});
        path.reverse();
      }
      pathMatrix[i][j] = path;
    }
  }
}

function totalDistance(route) {
  let d=0, prev=0; 
  route.forEach(i=>{
    d += distMatrix[prev][i+1]; prev = i+1;
  });
  d += distMatrix[prev][0];
  return d;
}

function startSA() {
  if (!warehouse||!customers.length) return alert('Place warehouse and customers first');
  computeDistances();
  T = +document.getElementById('temp-input').value;
  coolingRate = +document.getElementById('cool-rate-input').value;
  delay = +document.getElementById('delay-input').value;
  iter=0;
  currentRoute = customers.map((_,i)=>i);
  bestRoute = currentRoute.slice();
  currentDist = bestDist = totalDistance(currentRoute);
  clearInterval(timer);
  saRunning = true;
  timer = setInterval(()=>{
    if (T < 1e-3) {
      clearInterval(timer);
      saRunning = false;
      alert(`SA Complete!\nIterations: ${iter}\nBest Distance: ${bestDist.toFixed(2)}`);
      return;
    }
    const i = Math.floor(Math.random()*currentRoute.length);
    const j = Math.floor(Math.random()*currentRoute.length);
    const newRoute = currentRoute.slice();
    [newRoute[i],newRoute[j]] = [newRoute[j],newRoute[i]];
    const newDist = totalDistance(newRoute);
    const delta = newDist - currentDist;
    if (delta<0 || Math.random()<Math.exp(-delta/T)) {
      currentRoute=newRoute; currentDist=newDist;
      if (currentDist<bestDist) {
        bestDist=currentDist; bestRoute=currentRoute.slice();
        document.getElementById('dist').textContent = bestDist.toFixed(0);
      }
    }
    T*=coolingRate; iter++;
    document.getElementById('iter').textContent = iter;
    document.getElementById('temp').textContent = T.toFixed(2);
    draw();
  }, delay);
}

function resetAll() {
  saRunning = false;
  clearInterval(timer);
  customers=[]; warehouse=null; blocks=[];
  currentRoute=bestRoute=[];
  iter=0; document.getElementById('iter').textContent = 0;
  document.getElementById('temp').textContent = 0;
  document.getElementById('dist').textContent = 0;
  draw();
}

function drawArrowAt(from, to, color, scale = 1) {
  const x1 = (from.x + 0.5) * CELL, y1 = (from.y + 0.5) * CELL;
  const x2 = (to.x + 0.5) * CELL, y2 = (to.y + 0.5) * CELL;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const mx = (x1 + x2) * 0.5;
  const my = (y1 + y2) * 0.5;
  const len = CELL * scale;
  const headSize = CELL * 0.6 * scale;
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-len, headSize / 2);
  ctx.lineTo(-len, -headSize / 2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

draw();