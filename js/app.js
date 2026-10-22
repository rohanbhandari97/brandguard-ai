const state = {
  scanned: false,
  role: "creator",
  status: "Draft · Not checked",
  findings: [],
  audit: [
    {event:"Workspace opened", actor:"System", time:nowTime()},
    {event:"Sample draft loaded for review", actor:"System", time:nowTime()}
  ],
  approval: "Needs review"
};
const $ = id => document.getElementById(id);
const sampleCopy = "Buy now! Our product is guaranteed to be the No. 1 solution in India, delivering 100% results.";
const viewNames = {workspace:"Review content",dashboard:"Overview",guidelines:"Brand guidelines",approvals:"Approvals & history",analytics:"Insights"};

function nowTime(){return new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),2800);}
function logEvent(event){state.audit.unshift({event,actor:state.role==="creator"?"Creator":state.role==="manager"?"Brand manager":"Admin",time:nowTime()});renderAudit();}
function navigateTo(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active-view"));
  $("view-"+view)?.classList.add("active-view");
  

document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $("breadcrumb-current").textContent=viewNames[view]||"Workspace";
  $("sidebar").classList.remove("open");
  if(view==="approvals")renderAudit();
  if(view==="workspace")handleEditorInput();
}
function setStatus(text,type="amber"){
  state.status=text;$("status-text").textContent=text;
  const colors={amber:["#fff6e5","#99610d","#f5e5c3"],green:["#e8f7ef","#17845d","#cdebdc"],red:["#fff0f1","#c74a56","#f5d5d9"],gray:["#f5f6fa","#777c91","#e8eaf2"]};
  const c=colors[type]||colors.gray;const pill=$("status-badge");
  pill.style.background=c[0];pill.style.color=c[1];pill.style.borderColor=c[2];
  pill.querySelector(".status-dot").style.background=c[1];
}
function handleEditorInput(){
  const text=$("content-editor").value;
  $("word-count").textContent=(text.trim()?text.trim().split(/\s+/).length:0)+" words";
  $("char-count").textContent=text.length+" characters";
}
function loadSample(){
  $("content-editor").value=sampleCopy;handleEditorInput();state.scanned=false;state.findings=[];
  $("findings-container").innerHTML="";$("first-scan").classList.remove("hidden");$("scan-state").textContent="Ready to check";
  $("findings-count-badge").textContent="—";setStatus("Draft · Not checked","amber");
  toast("Sample draft added.");logEvent("Sample draft loaded");
}
function clearDraft(){
  $("content-editor").value="";handleEditorInput();state.findings=[];state.scanned=false;
  $("findings-container").innerHTML="";$("first-scan").classList.remove("hidden");$("scan-state").textContent="Ready to check";
  $("findings-count-badge").textContent="—";setStatus("Empty draft","gray");toast("Draft cleared.");
}
function scanContent(){
  const text=$("content-editor").value;
  if(!text.trim()){toast("Add some content first, then run a check.");$("content-editor").focus();return;}
  const rules=[
    {id:"claim-guarantee",severity:"HIGH",category:"Unsupported claim",title:"Absolute performance promise",regex:/100%\s*results|guarantee(?:d)?/i,match:/100%\s*results|guarantee(?:d)?/i,suggestion:"measurable results based on your needs",explanation:"Absolute promises can mislead customers unless the claim is supported by approved evidence."},
    {id:"claim-ranking",severity:"HIGH",category:"Claim needs evidence",title:"Unverified ranking claim",regex:/No\.\s*1|number\s*one|best solution/i,match:/No\.\s*1\s*solution(?:\s+in\s+India)?|No\.\s*1|number\s*one|best solution/i,suggestion:"a solution designed for your team",explanation:"A market-leading or number-one claim should be backed by reliable, approved evidence."},
    {id:"tone",severity:"MEDIUM",category:"Voice & tone",title:"High-pressure call to action",regex:/Buy now!?|Click here immediately|Hurry(?:\s+up)?!?|act now/i,match:/Buy now!?|Click here immediately|Hurry(?:\s+up)?!?|act now/i,suggestion:"Explore the solution",explanation:"Urgent sales language may conflict with a helpful, customer-first brand voice."}
  ];
  state.findings=rules.filter(r=>r.regex.test(text)).map(r=>{
    const match=text.match(r.match);
    return {...r,originalText:match?match[0]:"",resolved:false};
  });
  state.scanned=true;renderFindings();
  if(state.findings.length){setStatus("Review needed · Issues found","red");$("scan-state").textContent="Review suggestions";toast(`Check complete: ${state.findings.length} issue(s) found.`);}
  else{setStatus("Check complete · No rule matches","green");$("scan-state").textContent="No issues found";toast("No matching issues found. Human review is still recommended.");}
  logEvent(`Content checked: ${state.findings.length} issue(s) found`);
}
function renderFindings(){
  const active=state.findings.filter(f=>!f.resolved);
  $("findings-count-badge").textContent=state.scanned?active.length:"—";
  $("first-scan").classList.toggle("hidden",state.scanned);
  $("findings-container").innerHTML="";
  if(!state.scanned)return;
  if(!state.findings.length){
    $("findings-container").innerHTML='<div class="first-scan"><div class="first-scan-icon" style="background:#e8f7ef;color:#17845d">✓</div><h3>No matching issues found</h3><p>The current rules did not flag this draft. A person should still review it before publishing.</p></div>';return;
  }
  state.findings.forEach(f=>{
    const card=document.createElement("article");card.className="finding-card"+(f.resolved?" resolved":"");
    const top=document.createElement("div");top.className="finding-top";
    const severity=document.createElement("span");severity.className="severity "+(f.severity==="HIGH"?"high":"medium");severity.textContent=f.severity;
    const category=document.createElement("span");category.className="category";category.textContent=f.category;top.append(severity,category);
    if(f.resolved){const done=document.createElement("span");done.className="resolved-label";done.textContent="✓ Resolved";top.append(done);}
    const title=document.createElement("h3");title.className="finding-title";title.textContent=f.title;
    const flagged=document.createElement("p");flagged.className="flagged-text";flagged.textContent="Flagged: “"+f.originalText+"”";
    const explanation=document.createElement("p");explanation.className="finding-evidence";explanation.textContent=f.explanation;
    card.append(top,title,flagged,explanation);
    if(!f.resolved){
      const suggestion=document.createElement("div");suggestion.className="suggestion";
      const label=document.createElement("small");label.textContent="SUGGESTED ALTERNATIVE";
      const content=document.createElement("p");content.textContent=f.suggestion;suggestion.append(label,content);card.append(suggestion);
      const actions=document.createElement("div");actions.className="finding-actions";
      const accept=document.createElement("button");accept.className="small-button accept";accept.textContent="Apply suggestion";
      accept.addEventListener("click",()=>applySuggestion(f.id));
      const dismiss=document.createElement("button");dismiss.className="small-button";dismiss.textContent="Dismiss";
      dismiss.addEventListener("click",()=>dismissFinding(f.id));
      actions.append(accept,dismiss);card.append(actions);
    }
    $("findings-container").append(card);
  });
}
function applySuggestion(id){
  const finding=state.findings.find(f=>f.id===id);if(!finding)return;
  const editor=$("content-editor");const current=editor.value;
  if(finding.originalText&&current.toLowerCase().includes(finding.originalText.toLowerCase())){
    const idx=current.toLowerCase().indexOf(finding.originalText.toLowerCase());
    editor.value=current.slice(0,idx)+finding.suggestion+current.slice(idx+finding.originalText.length);
  }
  finding.resolved=true;handleEditorInput();renderFindings();toast("Suggestion applied to your draft.");logEvent(`Applied suggestion: ${finding.category}`);
}
function dismissFinding(id){const f=state.findings.find(x=>x.id===id);if(!f)return;f.resolved=true;renderFindings();toast("Finding dismissed for this review.");logEvent(`Finding dismissed: ${f.category}`);}
function resolveAllSafe(){state.findings.forEach(f=>f.resolved=true);renderFindings();toast("All current findings marked as reviewed.");logEvent("All findings marked as reviewed");}
function setRole(){
  state.role=$("role-select").value;
  const manager=state.role==="manager";
  $("approval-actions").classList.toggle("hidden",!manager);
  $("approval-description").textContent=manager?"Review the draft and approve it or request changes.":"Switch to Brand manager to use the demo approval controls.";
  toast("Role changed to "+$("role-select").selectedOptions[0].text+".");logEvent("Role changed to "+state.role);
}
function managerAction(action){
  if(state.role!=="manager"){toast("Switch to Brand manager to make a demo decision.");return;}
  state.approval=action==="approve"?"Approved":"Changes requested";
  $("approval-status").className="tag "+(action==="approve"?"tag-green":"tag-red");
  $("approval-status").textContent=state.approval;
  $("pending-count").textContent=action==="approve"?"0":"1";
  setStatus(action==="approve"?"Approved by manager":"Changes requested",action==="approve"?"green":"red");
  toast(action==="approve"?"Draft marked approved in this demo.":"Changes requested in this demo.");
  logEvent(action==="approve"?"Brand manager approved draft":"Brand manager requested changes");
}
function renderAudit(){
  $("audit-timeline").innerHTML="";
  state.audit.forEach(item=>{
    const row=document.createElement("div");row.className="timeline-item";
    const dot=document.createElement("span");dot.className="timeline-dot";
    const copy=document.createElement("div");copy.className="timeline-copy";
    const title=document.createElement("strong");title.textContent=item.event;
    const meta=document.createElement("small");meta.textContent="By "+item.actor;
    copy.append(title,meta);
    const time=document.createElement("span");time.className="timeline-time";time.textContent=item.time;
    row.append(dot,copy,time);$("audit-timeline").append(row);
  });
}
function exportAudit(){
  const blob=new Blob([JSON.stringify(state.audit,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="brandguard-review-history.json";a.click();URL.revokeObjectURL(url);toast("Review history exported.");
}
function addRule(){toast("Demo note: custom rule editing can be added in a future version.");logEvent("Opened add-rule action (demo)");}
function hexToRgb(hex){const m=hex.replace("#","");if(!/^[0-9a-f]{6}$/i.test(m))return null;return [parseInt(m.slice(0,2),16),parseInt(m.slice(2,4),16),parseInt(m.slice(4,6),16)];}
function luminance(rgb){const vals=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*vals[0]+.7152*vals[1]+.0722*vals[2];}
function contrastRatio(bg,fg){const a=hexToRgb(bg),b=hexToRgb(fg);if(!a||!b)return null;const l1=luminance(a),l2=luminance(b);return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);}
function updateContrast(source){
  const bg=$("bg-color-picker").value,fg=$("fg-color-picker").value;
  $("bg-color-text").value=bg.toUpperCase();$("fg-color-text").value=fg.toUpperCase();
  $("contrast-preview").style.background=bg;$("contrast-preview").style.color=fg;
  const ratio=contrastRatio(bg,fg);if(ratio===null)return;
  $("contrast-ratio-text").textContent="Contrast ratio: "+ratio.toFixed(2)+":1";
  const badge=$("contrast-badge");
  if(ratio>=7){badge.textContent="WCAG AAA";badge.className="mini-badge pass";}
  else if(ratio>=4.5){badge.textContent="WCAG AA";badge.className="mini-badge pass";}
  else{badge.textContent="Needs contrast";badge.className="mini-badge fail";}
}
function syncContrastText(which){
  const text=$(which+"-color-text").value;
  if(/^#[0-9A-F]{6}$/i.test(text))$(which+"-color-picker").value=text;
  updateContrast();
}
function applyTheme(theme){
  const dark = theme === "dark";
  document.body.dataset.theme = dark ? "dark" : "light";
  $("theme-icon").textContent = dark ? "☀" : "☾";
  $("theme-toggle").setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  $("theme-toggle").querySelector(".theme-toggle-label").textContent = dark ? "Light mode" : "Dark mode";
  $("theme-toggle").title = dark ? "Switch to light mode" : "Switch to dark mode";
}
function toggleTheme(){
  const next = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("brandguard-theme", next); } catch(e) {}
}

document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>navigateTo(b.dataset.view)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>navigateTo(b.dataset.goto)));
document.querySelectorAll(".brand").forEach(b=>b.addEventListener("click",e=>{e.preventDefault();navigateTo(b.dataset.view)}));
$("mobile-menu").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("content-editor").addEventListener("input",handleEditorInput);
$("run-scan").addEventListener("click",scanContent);$("run-scan-bottom").addEventListener("click",scanContent);$("empty-scan").addEventListener("click",scanContent);
$("load-sample").addEventListener("click",loadSample);$("clear-editor").addEventListener("click",clearDraft);
$("role-select").addEventListener("change",setRole);
$("contrast-toggle").addEventListener("click",()=>{$("contrast-panel").classList.toggle("hidden");updateContrast();});
$("close-contrast").addEventListener("click",()=>$("contrast-panel").classList.add("hidden"));
$("bg-color-picker").addEventListener("input",updateContrast);$("fg-color-picker").addEventListener("input",updateContrast);
$("bg-color-text").addEventListener("change",()=>syncContrastText("bg"));$("fg-color-text").addEventListener("change",()=>syncContrastText("fg"));
$("guideline-contrast").addEventListener("click",()=>{$("contrast-panel").classList.remove("hidden");updateContrast();});
$("add-rule").addEventListener("click",addRule);
$("export-audit").addEventListener("click",exportAudit);
$("request-changes").addEventListener("click",()=>managerAction("reject"));$("approve-content").addEventListener("click",()=>managerAction("approve"));
$("request-changes").addEventListener("click",()=>{if(state.role!=="manager")toast("Select Brand manager in the top bar first.");});
$("approve-content").addEventListener("click",()=>{if(state.role!=="manager")toast("Select Brand manager in the top bar first.");});
handleEditorInput();updateContrast();renderAudit();setRole();

$("theme-toggle").addEventListener("click",toggleTheme);
let savedTheme="light";try{savedTheme=localStorage.getItem("brandguard-theme")||"light";}catch(e){}
applyTheme(savedTheme);
