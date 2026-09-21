const el = id => document.getElementById(id);
const daysEl = el("days");
const resultsEl = el("results");
const statusEl = el("agentStatus");

const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDate = ts => {
  if (!ts) return "Data não identificada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(Number(ts) * 1000));
};

async function requestData(days) {
  const targets = [
    `/api/possivelmente-fechadas?days=${days}`,
    `http://127.0.0.1:8787/api/possivelmente-fechadas?days=${days}`
  ];

  let lastError;
  for (const url of targets) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Motor local indisponível");
}

function evidenceHtml(ev) {
  return `
    <div class="evidence-item">
      <div class="evidence-meta">
        <span class="relation">${escapeHtml(ev.relation)}</span>
        <span>${escapeHtml(ev.sender)}</span>
        <time>${formatDate(ev.timestamp)}</time>
      </div>
      <p class="evidence-reason">${escapeHtml(ev.reason)}</p>
      ${ev.signal ? `<p class="signal">Sinal detectado: “${escapeHtml(ev.signal)}”</p>` : ""}
      <blockquote>${escapeHtml(ev.text)}</blockquote>
    </div>`;
}

function itemHtml(item, index) {
  const idLabel = item.osNumber
    ? `OS ${escapeHtml(item.osNumber)}`
    : item.contractId
      ? `ID/Contrato ${escapeHtml(item.contractId)}`
      : escapeHtml(item.osIdentification);

  return `
    <article class="closed-card">
      <div class="closed-card-head">
        <div>
          <span class="candidate-number">#${index + 1}</span>
          <h3>${escapeHtml(item.client)}</h3>
          <div class="meta-line">
            <span>${idLabel}</span>
            <span>${formatDate(item.date)}</span>
            <span class="confidence ${escapeHtml(item.confidence)}">Confiança ${escapeHtml(item.confidence)}</span>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div><label>Cliente</label><p>${escapeHtml(item.client)}</p></div>
        <div><label>Identificação</label><p>${idLabel}</p></div>
        <div><label>Login</label><p>${escapeHtml(item.login || "—")}</p></div>
        <div><label>Serviço</label><p>${escapeHtml(item.service || "—")}</p></div>
      </div>

      <div class="description-box">
        <label>Descrição da OS</label>
        <p>${escapeHtml(item.description || "Descrição não identificada.")}</p>
      </div>

      <details class="original-message">
        <summary>Ver mensagem original completa</summary>
        <pre>${escapeHtml(item.originalText)}</pre>
      </details>

      <div class="evidence-section">
        <h4>Evidências que indicam possível conclusão</h4>
        <p class="score-line">Pontuação de conclusão: <b>${item.scores?.done ?? 0}</b> • Pendência: <b>${item.scores?.pending ?? 0}</b></p>
        <div class="evidence-list">
          ${(item.evidence || []).map(evidenceHtml).join("") || '<div class="empty-state">Sem evidências detalhadas.</div>'}
        </div>
      </div>
    </article>`;
}

function render(data) {
  el("periodValue").textContent = `${data.days} dias`;
  el("messageCount").textContent = Number(data.totalMessages || 0).toLocaleString("pt-BR");
  el("structuredCount").textContent = Number(data.totalStructuredOS || 0).toLocaleString("pt-BR");
  el("closedCount").textContent = Number(data.totalPossiblyClosed || 0).toLocaleString("pt-BR");

  statusEl.textContent = "Motor local conectado";
  statusEl.className = "status-badge online-state";

  if (!data.items?.length) {
    resultsEl.innerHTML = '<div class="empty-state">Nenhuma OS possivelmente fechada foi encontrada neste período.</div>';
    return;
  }

  resultsEl.innerHTML = data.items.map(itemHtml).join("");
}

async function load() {
  const days = Number(daysEl.value);
  statusEl.textContent = "Analisando histórico…";
  statusEl.className = "status-badge loading";
  resultsEl.innerHTML = '<div class="empty-state">Lendo mensagens e relacionando evidências…</div>';

  try {
    const data = await requestData(days);
    render(data);
  } catch (error) {
    statusEl.textContent = "Motor local indisponível";
    statusEl.className = "status-badge offline";
    resultsEl.innerHTML = `
      <div class="empty-state error-state">
        <b>Não foi possível acessar o histórico local.</b>
        <p>No computador que possui a Evolution API, abra a pasta Central OS e execute <code>npm run web</code>. Depois atualize esta página.</p>
      </div>`;
  }
}

el("refresh").addEventListener("click", load);
daysEl.addEventListener("change", load);
load();
