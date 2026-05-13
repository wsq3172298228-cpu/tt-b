/**
 * integrations/viewer — HTML dashboard for tt-b lifecycle.
 *
 * Serves a live dashboard showing health, memory, graph stats, and search.
 * Proxies API requests to the REST server.
 */

const http = require("http");

/**
 * Create an HTTP server serving the viewer dashboard.
 *
 * @param {object} opts
 * @param {number} opts.restPort — port of the REST API server to proxy to
 * @returns {http.Server}
 */
function createViewer({ restPort }) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>tt-b Lifecycle Viewer</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",monospace;background:#0d1117;color:#c9d1d9;padding:20px}
  h1{color:#58a6ff;margin-bottom:20px;font-size:1.5em}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}
  .card h2{color:#58a6ff;font-size:1em;margin-bottom:12px;border-bottom:1px solid #30363d;padding-bottom:8px}
  .status{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.85em}
  .ok{background:#1b4332;color:#40c057} .warn{background:#4a3800;color:#f5a623} .err{background:#4a1010;color:#f56565}
  table{width:100%;border-collapse:collapse;font-size:.85em}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #21262d} th{color:#8b949e}
  pre{background:#0d1117;border:1px solid #30363d;padding:12px;border-radius:4px;overflow-x:auto;font-size:.8em;max-height:300px;overflow-y:auto;white-space:pre-wrap}
  .actions{margin:16px 0}
  button{background:#238636;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:.85em;margin-right:8px}
  button:hover{background:#2ea043} button.secondary{background:#21262d;border:1px solid #30363d}
  #output{margin-top:16px}
</style>
</head>
<body>
<h1>tt-b Lifecycle Viewer</h1>
<div class="grid">
  <div class="card"><h2>Health</h2><div id="health">Loading...</div></div>
  <div class="card"><h2>Memory Files</h2><div id="memory">Loading...</div></div>
  <div class="card"><h2>Knowledge Graph Nodes</h2><div id="nodes">Loading...</div></div>
  <div class="card"><h2>Knowledge Graph Edges</h2><div id="edges">Loading...</div></div>
</div>
<div class="actions">
  <button onclick="doVerify()">Verify Memory</button>
  <button onclick="doSnapshot()" class="secondary">Create Snapshot</button>
  <button onclick="doSearch()">Search Memory</button>
</div>
<div id="output"></div>
<script>
const API='';
async function f(u,o){const r=await fetch(API+u,o);return r.json()}
async function load(){
  try{const h=await f('/health');document.getElementById('health').innerHTML='<p><span class="status ok">running</span> uptime: '+h.uptime+'s</p><p>root: '+h.projectRoot+'</p>'}
  catch{document.getElementById('health').innerHTML='<span class="status err">unreachable</span>'}
  const m=await f('/memory/list');if(Array.isArray(m)){let h='<table><tr><th>Key</th><th>Size</th><th>Modified</th></tr>';for(const i of m)h+='<tr><td>'+i.key+'</td><td>'+(i.size||'-')+'</td><td>'+(i.mtime?new Date(i.mtime).toLocaleString():'-')+'</td></tr>';h+='</table>';document.getElementById('memory').innerHTML=h}
  const n=await f('/memory/nodes');if(Array.isArray(n)){const b={};for(const x of n)(b[x.type]=b[x.type]||[]).push(x.name);let h='<table><tr><th>Type</th><th>Count</th><th>Names</th></tr>';for(const[t,names]of Object.entries(b))h+='<tr><td>'+t+'</td><td>'+names.length+'</td><td>'+names.slice(0,5).join(', ')+(names.length>5?'...':'')+'</td></tr>';h+='</table>';document.getElementById('nodes').innerHTML=h}
  const e=await f('/memory/edges');if(Array.isArray(e))document.getElementById('edges').innerHTML='<p>'+e.length+' edges total</p><pre>'+e.slice(0,20).map(x=>x.from.type+':'+x.from.name+' '+x.relation+' '+x.to.type+':'+x.to.name).join('\\n')+(e.length>20?'\\n...':'')+'</pre>'
}
async function doVerify(){const r=await f('/memory/verify');document.getElementById('output').innerHTML='<div class="card"><h2>Verify Result</h2><pre>'+JSON.stringify(r,null,2)+'</pre></div>'}
async function doSnapshot(){const r=await f('/memory/snapshot');document.getElementById('output').innerHTML='<div class="card"><h2>Snapshot</h2><pre>'+JSON.stringify(r,(k,v)=>v===null?null:(typeof v==='string'&&v.length>200?v.slice(0,200)+'...':v),2)+'</pre></div>'}
async function doSearch(){const p=prompt('Search pattern (regex):');if(!p)return;const r=await f('/memory/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pattern:p})});document.getElementById('output').innerHTML='<div class="card"><h2>Search Results</h2><pre>'+JSON.stringify(r,null,2)+'</pre></div>'}
load();setInterval(load,30000)
</script>
</body>
</html>`;

  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    // Proxy to REST
    const proxyReq = http.request(`http://localhost:${restPort}${req.url}`, { method: req.method, headers: req.headers }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on("error", () => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "REST API unavailable" }));
    });
    req.pipe(proxyReq);
  });

  return server;
}

module.exports = { createViewer };
