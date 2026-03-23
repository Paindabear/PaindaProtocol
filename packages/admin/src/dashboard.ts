/** Self-contained admin dashboard HTML — no external dependencies, no CDN. */
export const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PaindaProtocol Admin</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3e;
    --text: #e2e8f0; --muted: #64748b; --accent: #6366f1;
    --green: #22c55e; --red: #ef4444; --yellow: #eab308;
  }
  body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 1rem 2rem; display: flex; align-items: center; gap: 1rem; }
  header h1 { font-size: 1.25rem; font-weight: 700; letter-spacing: -0.02em; }
  header .badge { background: var(--accent); color: #fff; font-size: 0.7rem; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
  .uptime { margin-left: auto; color: var(--muted); font-size: 0.875rem; }
  .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
  .stat-card .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
  .stat-card .value { font-size: 2rem; font-weight: 700; }
  .stat-card.clients .value { color: var(--green); }
  .stat-card.rooms .value { color: var(--accent); }
  .stat-card.plugins .value { color: var(--yellow); }
  .stat-card.presence .value { color: #a78bfa; }
  .section { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; margin-bottom: 1.5rem; overflow: hidden; }
  .section-header { padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); font-weight: 600; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem; }
  .section-header .count { background: var(--border); color: var(--muted); border-radius: 99px; padding: 1px 8px; font-size: 0.75rem; }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th { padding: 0.75rem 1.25rem; text-align: left; font-weight: 500; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 0.75rem 1.25rem; border-top: 1px solid var(--border); }
  tr:hover td { background: rgba(255,255,255,0.02); }
  .mono { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.8rem; }
  .tag { display: inline-block; background: var(--border); border-radius: 4px; padding: 1px 6px; font-size: 0.7rem; margin: 1px; }
  .pill { display: inline-block; border-radius: 99px; padding: 1px 8px; font-size: 0.7rem; font-weight: 600; }
  .pill.green { background: rgba(34,197,94,0.15); color: var(--green); }
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0; }
  .metric-row { padding: 0.75rem 1.25rem; border-top: 1px solid var(--border); display: flex; justify-content: space-between; }
  .metric-row:first-child { border-top: none; }
  .metric-name { color: var(--muted); font-size: 0.8rem; }
  .metric-val { font-weight: 600; font-variant-numeric: tabular-nums; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); display: inline-block; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  .empty { color: var(--muted); font-style: italic; padding: 1.5rem 1.25rem; font-size: 0.875rem; }
</style>
</head>
<body>
<header>
  <span class="dot"></span>
  <h1>PaindaProtocol Admin</h1>
  <span class="badge">Live</span>
  <span class="uptime" id="uptime">uptime: —</span>
</header>
<div class="container">
  <div class="stats-grid">
    <div class="stat-card clients"><div class="label">Connected Clients</div><div class="value" id="s-clients">—</div></div>
    <div class="stat-card rooms"><div class="label">Active Rooms</div><div class="value" id="s-rooms">—</div></div>
    <div class="stat-card plugins"><div class="label">Plugins</div><div class="value" id="s-plugins">—</div></div>
    <div class="stat-card presence"><div class="label">Presence Tracked</div><div class="value" id="s-presence">—</div></div>
  </div>

  <div class="section" id="clients-section">
    <div class="section-header">Connected Clients <span class="count" id="client-count">0</span></div>
    <div id="clients-body"><p class="empty">No clients connected.</p></div>
  </div>

  <div class="section" id="metrics-section" style="display:none">
    <div class="section-header">Metrics</div>
    <div class="metrics-grid" id="metrics-body"></div>
  </div>
</div>
<script>
  function fmt(n) { return typeof n === 'number' ? n.toLocaleString() : n ?? '—'; }
  function fmtUptime(s) {
    if (!s) return '—';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return h > 0 ? h + 'h ' + m + 'm' : m > 0 ? m + 'm ' + sec + 's' : sec + 's';
  }

  async function refresh() {
    try {
      const [statsRes, clientsRes] = await Promise.all([
        fetch('/api/stats'), fetch('/api/clients')
      ]);
      const stats = await statsRes.json();
      const clients = await clientsRes.json();

      document.getElementById('s-clients').textContent = fmt(stats.clients);
      document.getElementById('s-rooms').textContent = fmt(stats.rooms);
      document.getElementById('s-plugins').textContent = fmt(stats.plugins);
      document.getElementById('s-presence').textContent = fmt(stats.presenceTracked);
      document.getElementById('uptime').textContent = 'uptime: ' + fmtUptime(stats.uptime);
      document.getElementById('client-count').textContent = clients.length;

      const cb = document.getElementById('clients-body');
      if (clients.length === 0) {
        cb.innerHTML = '<p class="empty">No clients connected.</p>';
      } else {
        cb.innerHTML = '<table><thead><tr><th>ID</th><th>Rooms</th><th>Tags</th></tr></thead><tbody>' +
          clients.map(c => '<tr>' +
            '<td class="mono">' + c.id + '</td>' +
            '<td>' + (c.rooms.length ? c.rooms.map(r => '<span class="tag">' + r + '</span>').join('') : '<span style="color:var(--muted)">—</span>') + '</td>' +
            '<td>' + (Object.keys(c.tags).length ? Object.entries(c.tags).map(([k,v]) => '<span class="tag">' + k + '=' + v + '</span>').join('') : '<span style="color:var(--muted)">—</span>') + '</td>' +
          '</tr>').join('') +
          '</tbody></table>';
      }

      if (stats.metrics) {
        const ms = stats.metrics;
        const metricsSection = document.getElementById('metrics-section');
        metricsSection.style.display = '';
        const mb = document.getElementById('metrics-body');
        const rows = [
          ['Messages Received', ms.messagesReceived],
          ['Messages Sent', ms.messagesSent],
          ['Bytes Received', ms.bytesReceived],
          ['Bytes Sent', ms.bytesSent],
          ['Connections Total', ms.connectionsTotal],
          ['Disconnections Total', ms.disconnectionsTotal],
          ['Room Joins', ms.roomJoinsTotal],
          ['Room Leaves', ms.roomLeavesTotal],
          ['Errors', ms.errorsTotal],
        ];
        mb.innerHTML = rows.map(([k, v]) =>
          '<div class="metric-row"><span class="metric-name">' + k + '</span><span class="metric-val">' + fmt(v) + '</span></div>'
        ).join('');
      }
    } catch (e) {
      console.warn('Admin refresh error:', e);
    }
  }

  refresh();
  setInterval(refresh, 2000);
</script>
</body>
</html>
`;
