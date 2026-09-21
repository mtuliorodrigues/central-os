const menuButton=document.querySelector("[data-menu-toggle]");
const closeMenu=()=>document.body.classList.remove("menu-open");
menuButton?.addEventListener("click",()=>document.body.classList.toggle("menu-open"));
document.addEventListener("click",(event)=>{
  if(!document.body.classList.contains("menu-open")) return;
  const sidebar=document.querySelector(".sidebar");
  if(sidebar?.contains(event.target)||menuButton?.contains(event.target)) return;
  closeMenu();
});
document.querySelectorAll(".nav-link").forEach(link=>link.addEventListener("click",closeMenu));
