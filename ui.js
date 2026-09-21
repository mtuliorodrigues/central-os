let page = document.body.dataset.page || "dashboard";
const sidebar = document.querySelector("[data-autonav]");
let navigationCounter = 0;
let navigating = false;

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
  return `<a class="nav-link ${page === key ? "active" : ""}" data-page-key="${key}" href="${href}" title="${label}"><span class="nav-link__icon">${icon}</span><span class="nav-link__text">${label}</span></a>`;
}

function renderSidebar() {
  if (!sidebar) return;
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

function updateActiveNav() {
  document.querySelectorAll(".nav-link[data-page-key]").forEach(link => {
    link.classList.toggle("active", link.dataset.pageKey === page);
  });
}

renderSidebar();

const menuButton = () => document.querySelector("[data-menu-toggle]");
const closeMenu = () => document.body.classList.remove("menu-open");

document.addEventListener("click", event => {
  const toggle = event.target.closest("[data-menu-toggle]");
  if (toggle) {
    event.preventDefault();
    document.body.classList.toggle("menu-open");
    return;
  }

  if (!document.body.classList.contains("menu-open")) return;
  const currentSidebar = document.querySelector(".sidebar");
  if (currentSidebar?.contains(event.target)) return;
  closeMenu();
});

if (sidebar) {
  const setExpanded = expanded => document.body.classList.toggle("sidebar-expanded", expanded);
  sidebar.addEventListener("mouseenter", () => setExpanded(true));
  sidebar.addEventListener("mouseleave", () => setExpanded(false));
  sidebar.addEventListener("focusin", () => setExpanded(true));
  sidebar.addEventListener("focusout", event => {
    if (!sidebar.contains(event.relatedTarget)) setExpanded(false);
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

function isSoftNavigable(anchor, event) {
  if (!anchor || anchor.dataset.noSoftNav != null) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return false;

  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin) return false;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
  return true;
}

async function runPageScripts(doc) {
  const scripts = [...doc.querySelectorAll("script[src]")]
    .map(script => new URL(script.getAttribute("src"), location.origin))
    .filter(url => !["/ui.js", "/global-import.js"].includes(url.pathname));

  for (const url of scripts) {
    if (!url.pathname.endsWith(".js")) continue;
    url.searchParams.set("_nav", String(++navigationCounter));
    try {
      await import(url.href);
    } catch (error) {
      console.error("Falha ao iniciar página:", url.pathname, error);
    }
  }
}

async function softNavigate(target, { push = true } = {}) {
  if (navigating) return;
  const url = new URL(target, location.href);
  navigating = true;
  document.body.classList.add("page-changing");

  try {
    const response = await fetch(url.pathname + url.search, {
      cache: "no-store",
      headers: { "X-Central-OS-Navigation": "partial" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const nextMain = doc.querySelector("main.main");
    const currentMain = document.querySelector("main.main");
    if (!nextMain || !currentMain) throw new Error("Conteúdo da página não encontrado.");

    const nextPage = doc.body.dataset.page || "dashboard";
    const nextView = doc.body.dataset.view || "";

    currentMain.replaceWith(nextMain.cloneNode(true));
    document.body.dataset.page = nextPage;
    if (nextView) document.body.dataset.view = nextView;
    else delete document.body.dataset.view;

    page = nextPage;
    document.title = doc.title || document.title;
    updateActiveNav();
    closeMenu();

    if (push) history.pushState({ centralOS: true }, "", url.pathname + url.search + url.hash);

    window.dispatchEvent(new CustomEvent("centralos:navigated", {
      detail: { page: nextPage, path: url.pathname }
    }));

    await runPageScripts(doc);
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch (error) {
    console.error(error);
    location.href = url.href;
  } finally {
    navigating = false;
    document.body.classList.remove("page-changing");
  }
}

document.addEventListener("click", event => {
  const anchor = event.target.closest("a[href]");
  if (!isSoftNavigable(anchor, event)) return;
  event.preventDefault();
  softNavigate(anchor.href);
});

window.addEventListener("popstate", () => softNavigate(location.href, { push: false }));

window.CentralOS = {
  navigate: target => softNavigate(target),
  refresh: () => softNavigate(location.href, { push: false })
};

updateAgentStatus();
window.setInterval(updateAgentStatus, 60_000);
import("/global-import.js").catch(() => {});
