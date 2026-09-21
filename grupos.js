import { localApiFetch } from "/local-api.js";

const list = document.getElementById("groupsList");
const badge = document.getElementById("groupsCount");

async function load() {
  try {
    const data = await localApiFetch("/api/grupos");
    const groups = data.groups || [];
    const available = groups.filter(group => group.available);
    badge.textContent = available.length + " disponível(is)";
    list.innerHTML = groups.map(group =>
      '<article class="info-card group-card">' +
        '<div class="info-card__top"><div><h3>' + group.name + '</h3>' +
        '<p>' + (group.available ? "Disponível para consulta de contexto e evidências." : "Ainda não disponível nesta sessão.") + '</p></div>' +
        '<span class="panel__badge ' + (group.available ? "" : "warning") + '">' + (group.available ? "Disponível" : "Indisponível") + '</span></div>' +
      '</article>'
    ).join("");
  } catch {
    badge.textContent = "Indisponível";
    badge.className = "panel__badge danger";
    list.innerHTML = '<div class="empty-state error-state">Não foi possível consultar os grupos agora.</div>';
  }
}

load();
