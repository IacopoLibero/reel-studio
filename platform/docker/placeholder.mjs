// used only while platform/hub has no package.json
import http from "node:http";
http.createServer((q, r) => {
  r.setHeader("content-type", "application/json");
  r.end(q.url === "/api/health" ? '{"status":"ok","placeholder":true}' : '{"placeholder":"hub not built yet"}');
}).listen(4000, "0.0.0.0");
