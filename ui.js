let page = document.body.dataset.page || "dashboard";
const sidebar = document.querySelector("[data-autonav]");
let navigationCounter = 0;
let navigating = false;
const pageHtmlCache = new Map();
let localApiModulePromise = null;

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
      <span class="brand__icon"><img class="brand__logo" src="/assets/central-os-logo.png" alt="" aria-hidden="true"></span>
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

const closeMenu = () => document.body.classList.remove("menu-open");

document.addEventListener("click", event => {
  const toggle = event.target.closest("[data-menu-toggle]");
  if (toggle) {
    event.preventDefault();
    document.body.classList.toggle("menu-open");
    return;
  }

  if (!document.body.classList.contains("menu-open")) return;
  if (document.querySelector(".sidebar")?.contains(event.target)) return;
  closeMenu();
});

if (sidebar) {
  const setExpanded = expanded => {
    if (window.innerWidth <= 820) {
      document.body.classList.remove("sidebar-expanded");
      return;
    }
    document.body.classList.toggle("sidebar-expanded", Boolean(expanded));
  };

  let lastPointer = { x: -1, y: -1 };

  const syncSidebarToPointer = () => {
    if (window.innerWidth <= 820 || lastPointer.x < 0 || lastPointer.y < 0) {
      setExpanded(false);
      return;
    }
    const underPointer = document.elementFromPoint(lastPointer.x, lastPointer.y);
    setExpanded(Boolean(underPointer && sidebar.contains(underPointer)));
  };

  sidebar.addEventListener("pointerenter", event => {
    lastPointer = { x: event.clientX, y: event.clientY };
    setExpanded(true);
  });

  sidebar.addEventListener("pointerleave", event => {
    lastPointer = { x: event.clientX, y: event.clientY };
    setExpanded(false);
  });

  document.addEventListener("pointermove", event => {
    lastPointer = { x: event.clientX, y: event.clientY };
    if (document.body.classList.contains("sidebar-expanded")) {
      const underPointer = document.elementFromPoint(event.clientX, event.clientY);
      if (!underPointer || !sidebar.contains(underPointer)) setExpanded(false);
    }
  }, { passive: true });

  window.addEventListener("blur", () => setExpanded(false));
  window.addEventListener("resize", syncSidebarToPointer);

  window.CentralOSSidebar = { sync: syncSidebarToPointer, collapse: () => setExpanded(false) };
}

async function localApi() {
  if (!localApiModulePromise) localApiModulePromise = import("/local-api.js");
  return localApiModulePromise;
}

const sharedData = {
  analysis: new Map(),
  summary: null,
  history: null,
  groups: null,

  invalidate() {
    this.analysis.clear();
    this.summary = null;
    this.history = null;
    this.groups = null;
  },

  setAnalysis(days, data) {
    this.analysis.set(Number(days) === 20 ? 20 : 30, data);
  },

  peekAnalysis(days = 30) {
    return this.analysis.get(Number(days) === 20 ? 20 : 30) || null;
  },

  peekSummary() {
    return this.summary;
  },

  peekHistory() {
    return this.history;
  },

  peekGroups() {
    return this.groups;
  },

  async getAnalysis(days = 30, { force = false } = {}) {
    const normalized = Number(days) === 20 ? 20 : 30;
    if (!force && this.analysis.has(normalized)) return this.analysis.get(normalized);
    const { localApiFetch } = await localApi();
    const data = await localApiFetch("/api/analise?days=" + normalized);
    this.analysis.set(normalized, data);
    return data;
  },

  async getSummary({ force = false } = {}) {
    if (!force && this.summary) return this.summary;
    const { localApiFetch } = await localApi();
    this.summary = await localApiFetch("/api/resumo");
    return this.summary;
  },

  async getHistory({ force = false } = {}) {
    if (!force && this.history) return this.history;
    const { localApiFetch } = await localApi();
    this.history = await localApiFetch("/api/historico");
    return this.history;
  },

  async getGroups({ force = false } = {}) {
    if (!force && this.groups) return this.groups;
    const { localApiFetch } = await localApi();
    this.groups = await localApiFetch("/api/grupos");
    return this.groups;
  }
};

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

async function getPageHtml(url, { force = false } = {}) {
  const key = url.pathname + url.search;
  if (!force && pageHtmlCache.has(key)) return pageHtmlCache.get(key);

  const response = await fetch(key, {
    cache: "no-store",
    headers: { "X-Central-OS-Navigation": "partial" }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const html = await response.text();
  pageHtmlCache.set(key, html);
  return html;
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

async function softNavigate(target, { push = true, forceHtml = false } = {}) {
  if (navigating) return;
  const url = new URL(target, location.href);
  navigating = true;
  document.body.classList.add("page-changing");

  try {
    const html = await getPageHtml(url, { force: forceHtml });
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
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    requestAnimationFrame(() => window.CentralOSSidebar?.sync?.());

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
  refresh: () => softNavigate(location.href, { push: false }),
  data: sharedData
};

function prefetchNavigation() {
  const urls = [...navItems, ...systemItems].map(([, href]) => new URL(href, location.origin));
  urls.forEach((url, index) => {
    window.setTimeout(() => {
      getPageHtml(url).catch(() => {});
    }, 120 + index * 45);
  });
}

if ("requestIdleCallback" in window) {
  requestIdleCallback(prefetchNavigation, { timeout: 1500 });
} else {
  window.setTimeout(prefetchNavigation, 250);
}

updateAgentStatus();
window.setInterval(updateAgentStatus, 60_000);
import("/global-import.js").catch(() => {});
