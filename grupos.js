import { localApiFetch } from "/local-api.js";

const list = document.getElementById("groupsList");
const badge = document.getElementById("groupsCount");
const escapeHtml = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function loadingCards() {
  return Array.from({ length: 4 }, () =>
    '<article class="info-card group-card skeleton-card">' +
      '<div class="skeleton-block w-55 skeleton-title"></div>' +
      '<div class="skeleton-block w-85 skeleton-text"></div>' +
    '</article>'
  ).join("");
}

function render(data) {
  const groups = data.groups || [];
  const available = groups.filter(group => group.available);
  badge.textContent = available.length + " disponível(is)";
  badge.className = "panel__badge info";
  list.innerHTML = groups.map(group =>
    '<article class="info-card group-card">' +
      '<div class="info-card__top"><div><h3>' + escapeHtml(group.name) + '</h3>' +
      '<p>' + (group.available ? "Disponível para consulta de contexto e evidências." : "Ainda não disponível nesta sessão.") + '</p></div>' +
      '<span class="panel__badge ' + (group.available ? "" : "warning") + '">' + (group.available ? "Disponível" : "Indisponível") + '</span></div>' +
    '</article>'
  ).join("");
}

async function load() {
  const shared = window.CentralOS?.data;
  const immediate = shared?.peekGroups?.();
  if (immediate) {
    render(immediate);
    return;
  }

  list.innerHTML = loadingCards();
  badge.textContent = "Carregando";
  try {
    const data = shared?.getGroups ? await shared.getGroups() : await localApiFetch("/api/grupos");
    render(data);
  } catch {
    badge.textContent = "Indisponível";
    badge.className = "panel__badge danger";
    list.innerHTML = '<div class="empty-state error-state">Não foi possível consultar os grupos agora.</div>';
  }
}

load();
