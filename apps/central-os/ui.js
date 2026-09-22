const page = document.body.dataset.page || "dashboard";
const nav = document.querySelector("[data-autonav]");
const items = [
  ["dashboard", "/", "⌂", "Dashboard"],
  ["analisadas", "/os-analisadas", "≡", "OS Analisadas"],
  ["localizadas", "/localizadas", "◎", "Localizadas"],
  ["nao-localizadas", "/nao-localizadas", "×", "Não localizadas"],
  ["fechadas", "/possivelmente-fechadas", "✓", "Poss. fechadas"],
  ["pendentes", "/pendentes", "◷", "Pendentes"],
  ["historico", "/historico", "↺", "Histórico"],
  ["grupos", "/grupos", "◉", "Grupos"]
];
if (nav) {
  nav.innerHTML = `<a class="brand" href="/"><span class="brand-mark">CO</span><span><b>Central OS</b><small>Integrada</small></span></a><nav class="nav-list">${items.map(([key,href,icon,label]) => `<a class="nav-link ${page===key?"active":""}" href="${href}"><i>${icon}</i><span>${label}</span></a>`).join("")}</nav><div class="sidebar-foot"><span class="dot"></span><span>Dois motores • uma interface</span></div>`;
}
document.querySelector("[data-menu-toggle]")?.addEventListener("click", () => document.body.classList.toggle("menu-open"));
