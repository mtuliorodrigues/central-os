const page = document.body.dataset.page || "dashboard";
const sidebar = document.querySelector("[data-autonav]");

const navItems = [
  ["dashboard", "/", "⌂", "Dashboard"],
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
  return `<a class="nav-link ${page === key ? "active" : ""}" href="${href}" title="${label}"><span class="nav-link__icon">${icon}</span><span class="nav-link__text">${label}</span></a>`;
}

if (sidebar) {
  sidebar.innerHTML = `
    <a class="brand" href="/" title="Central OS">
      <span class="brand__icon">OS</span>
      <span class="brand__copy"><span class="brand__text">Central OS</span><span class="brand__sub">Play Soluções</span></span>
    </a>
    <nav class="navigation">
      <div class="nav-label">Operação</div>
      ${navItems.map(navLink).join("")}
      <div class="nav-label nav-label--secondary">Sistema</div>
      ${systemItems.map(navLink).join("")}
    </nav>
    <div class="sidebar-agent" id="sidebarAgent" data-state="checking" title="Status do agente">
      <span class="pulse-dot"></span>
      <span class="sidebar-agent__text">Agente verificando</span>
    </div>
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

const currentSidebar = document.querySelector(".sidebar");
if (currentSidebar) {
  const setExpanded = expanded => document.body.classList.toggle("sidebar-expanded", expanded);
  currentSidebar.addEventListener("mouseenter", () => setExpanded(true));
  currentSidebar.addEventListener("mouseleave", () => setExpanded(false));
  currentSidebar.addEventListener("focusin", () => setExpanded(true));
  currentSidebar.addEventListener("focusout", event => {
    if (!currentSidebar.contains(event.relatedTarget)) setExpanded(false);
  });
}

async function updateAgentStatus() {
  const status = document.getElementById("sidebarAgent");
  if (!status) return;

  const targets = location.hostname === "127.0.0.1" || location.hostname === "localhost"
    ? ["/api/planilha/status", "http://127.0.0.1:8787/api/planilha/status"]
    : ["http://127.0.0.1:8787/api/planilha/status"];

  for (const target of targets) {
    try {
      const response = await fetch(target, { cache: "no-store" });
      if (!response.ok) continue;
      status.dataset.state = "online";
      status.querySelector(".sidebar-agent__text").textContent = "Agente conectado";
      return;
    } catch {}
  }

  status.dataset.state = "offline";
  status.querySelector(".sidebar-agent__text").textContent = "Agente indisponível";
}

updateAgentStatus();
