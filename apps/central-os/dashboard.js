import { localApiFetch } from "/local-api.js";
const $ = id => document.getElementById(id);
const ids = { reportsGenerated:"reportsCount", analyzed:"analyzedCount", located:"locatedCount", notLocated:"missingCount", possiblyClosed:"closedCount", pending:"pendingCount" };
function setCounts(c={}) { for (const [k,id] of Object.entries(ids)) $(id).textContent=Number(c[k]||0).toLocaleString("pt-BR"); }
function message(id,text,type="info") { const el=$(id); el.hidden=!text; el.textContent=text||""; el.className=`message ${type}`; }
function status(dotId,textId,state,text) { const d=$(dotId); d.className=`health-dot ${state?"ok":"bad"}`; $(textId).textContent=text||"—"; }
function formatDate(v){ if(!v)return "—"; const d=new Date(v); return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short"}).format(d); }
async function loadSummary(){
  try { const d=await localApiFetch("/api/resumo"); setCounts(d.counts); $("analysisBadge").textContent=d.imported?"Disponível":"Aguardando planilha"; $("analysisBadge").className=`badge ${d.imported?"ok":"neutral"}`; $("dashboardFile").textContent=d.imported?`Planilha: ${d.import?.fileName||"importada"}`:"Nenhuma planilha carregada"; $("dashboardUpdated").textContent=d.lastAnalysis?`Última análise: ${formatDate(d.lastAnalysis)}`:"Importe uma planilha para iniciar a análise."; }
  catch(e){ $("analysisBadge").textContent="Indisponível"; $("analysisBadge").className="badge bad"; message("analysisMessage",e.message,"bad"); }
}
async function loadReport(){
  try {
    const [sheets,statusData]=await Promise.all([localApiFetch("/api/relatorio/planilhas"),localApiFetch("/api/relatorio/status")]);
    const r=statusData;
    status("dotEvolution","statusEvolution",r.evolution?.ok,r.evolution?.detail);
    status("dotPostgres","statusPostgres",r.postgres?.ok,r.postgres?.detail);
    status("dotWhatsapp","statusWhatsapp",r.whatsapp?.connected,`${r.whatsapp?.instance||"sgp-whatsapp"}: ${r.whatsapp?.state||"desconhecido"}`);
    status("dotListener","statusListener",r.listener?.running&&r.listener?.count===1,r.listener?.detail);
    $("reportReady").textContent=r.ready?"Pronto":"Atenção"; $("reportReady").className=`badge ${r.ready?"ok":"warn"}`;
    $("originGroup").textContent=r.config?.origem?.name||r.config?.origem?.id||"Não configurado";
    $("destinationGroup").textContent=r.config?.destino?.name||r.config?.destino?.id||"Não configurado";
    $("lastReport").textContent=r.lastReport?`${r.lastReport.fileName} • ${formatDate(r.lastReport.modifiedAt)}`:"Nenhum registrado";
    const select=$("reportSheet"); const list=sheets.planilhas||[]; select.innerHTML=list.length?list.map(x=>`<option value="${x.name.replaceAll('"','&quot;')}">${x.name}</option>`).join(""):'<option value="">Nenhuma planilha</option>';
    const enabled=Boolean(r.config?.webExecutionEnabled && r.config?.configured && list.length && !r.reportExecution?.locked);
    $("runReport").disabled=!enabled;
    $("executionHint").textContent=r.config?.webExecutionEnabled ? (r.reportExecution?.locked?"Já existe um relatório em execução.":"Execução real habilitada. Confirme antes de enviar.") : "Execução pelo painel desativada por segurança. Ative somente após validar o baseline manual.";
  } catch(e){ $("reportReady").textContent="Indisponível"; $("reportReady").className="badge bad"; message("reportMessage",e.message,"bad"); }
}
function fileToBase64(file){ return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error);reader.onload=()=>resolve(String(reader.result||"").split(",").pop());reader.readAsDataURL(file);}); }
$("analysisFile").addEventListener("change",async()=>{const file=$("analysisFile").files?.[0];if(!file)return;message("analysisMessage","Importando e analisando…");try{const dataBase64=await fileToBase64(file);await localApiFetch("/api/planilha/importar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileName:file.name,dataBase64})});const a=await localApiFetch("/api/analise/processar",{method:"POST"});message("analysisMessage",`Análise concluída: ${a.totalSpreadsheetOS||0} OS processadas.`,"ok");await loadSummary();}catch(e){message("analysisMessage",e.message,"bad");}finally{$("analysisFile").value="";}});
$("refreshReport").addEventListener("click",loadReport);
$("runReport").addEventListener("click",async()=>{const fileName=$("reportSheet").value;if(!fileName)return;if(!confirm(`Executar o relatório REAL usando ${fileName}? As mensagens poderão ser encaminhadas ao grupo de destino.`))return;$("runReport").disabled=true;message("reportMessage","Relatório em execução…");try{const r=await localApiFetch("/api/relatorio/executar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fileName})});message("reportMessage",`Relatório concluído. ${r.summary?.sent??"Envio registrado no log."}`,"ok");}catch(e){message("reportMessage",e.message,"bad");}finally{await loadReport();}});
loadSummary();loadReport();setInterval(loadReport,30000);
