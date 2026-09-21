const page = document.body.dataset.page || "dashboard";
const sidebar = document.querySelector("[data-autonav]");

const navItems = [
  ["dashboard", "/", "⌂", "Dashboard"],
  ["importar", "/importar-planilha", "⇧", "Importar Planilha"],
  ["analisadas", "/os-analisadas", "≡", "OS Analisadas"],
  ["localizadas", "/localizadas", "◎", "Localizadas nos Grupos"],
  ["nao-localizadas", "/nao-localizadas", "×", "Não Localizadas"],
  ["fechadas", "/possivelmente-fechadas", "✓", "Possivelmente Fechadas"],
  ["pendentes", "/pendentes", "◷", "Pendentes / Em análise"],
  ["historico", "/historico", "↺", "Histórico"]
];

const systemItems = [
  ["grupos", "/grupos", "◉", "Grupos"],
  ["configuracoes", "/configuracoes", "⚙", "Configurações"]
];

function navLink([key, href, icon, label]) {
  return `<a class="nav-link ${page === key ? "active" : ""}" href="${href}"><span class="nav-link__icon">${icon}</span><span>${label}</span></a>`;
}

if (sidebar) {
  sidebar.innerHTML = `
    <a class="brand" href="/"><span class="brand__icon">OS</span><span><span class="brand__text">Central OS</span><span class="brand__sub">Play Soluções</span></span></a>
    <nav class="navigation">
      <div class="nav-label">Operação</div>
      ${navItems.map(navLink).join("")}
      <div class="nav-label nav-label--secondary">Sistema</div>
      ${systemItems.map(navLink).join("")}
    </nav>
    <div class="sidebar-card">
      <div class="sidebar-card__label">Central OS</div>
      <div class="sidebar-card__status"><span class="pulse-dot"></span><span>Operação disponível</span></div>
      <div class="sidebar-card__message">A planilha define as OS; os grupos fornecem o contexto da análise.</div>
    </div>
    <div class="sidebar-meta">Central OS • Play Soluções</div>
  `;
}

const menuButton = document.querySelector("[data-menu-toggle]");
const closeMenu = () => document.body.classList.remove("menu-open");
menuButton?.addEventListener("click", () => document.body.classList.toggle("menu-open"));

document.addEventListener("click", event => {
  if (!document.body.classList.contains("menu-open")) return;
  const currentSidebar = document.querySelector(".sidebar");
  if (currentSidebar?.contains(event.target) || menuButton?.contains(event.target)) return;
  closeMenu();
});

document.querySelectorAll(".nav-link").forEach(link => link.addEventListener("click", closeMenu));
