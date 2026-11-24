export type ProjectFiles = Record<string, string>;

export const STARTER_FILES: ProjectFiles = {
  "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>My app</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>Hello from ExpertsTeam</h1>
    <p>Ask the agent to build something.</p>
  </main>
  <script src="script.js"></script>
</body>
</html>`,
  "style.css": `body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #0b1020; color: #e6ecff; }`,
  "script.js": `console.log("ready");`,
};

/** Inline local CSS/JS files into index.html so the app runs inside a sandboxed iframe. */
export function buildSrcDoc(files: ProjectFiles): string {
  const entry =
    files["index.html"] ??
    Object.entries(files).find(([name]) => name.endsWith(".html"))?.[1] ??
    "";
  if (!entry) return "<p style='font-family:sans-serif'>No index.html yet.</p>";
  let html = entry.replace(
    /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi,
    (match, href: string) => {
      const css = files[href.replace(/^\.?\//, "")];
      return css !== undefined ? `<style>\n${css}\n</style>` : match;
    },
  );
  html = html.replace(
    /<script([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi,
    (match, before: string, src: string, after: string) => {
      const js = files[src.replace(/^\.?\//, "")];
      if (js === undefined) return match;
      const isModule = /type=["']module["']/.test(before + after);
      return `<script${isModule ? ' type="module"' : ""}>\n${js.replace(/<\/script>/gi, "<\\/script>")}\n</script>`;
    },
  );
  return html;
}

const CONSOLE_BRIDGE = `<script>(function(){var send=function(t,a){try{parent.postMessage({__agentConsole:true,type:t,message:Array.prototype.map.call(a,function(x){try{return typeof x==="string"?x:JSON.stringify(x)}catch(e){return String(x)}}).join(" ")},"*")}catch(e){}};var safeUrl=function(value){try{var u=new URL(String(value),location.href);return u.origin+u.pathname}catch(e){return String(value).split("?")[0]}};["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o.apply(console,arguments)}});var originalFetch=window.fetch;if(originalFetch)window.fetch=function(){var args=arguments;var url=safeUrl(args[0]&&args[0].url?args[0].url:args[0]);var method=(args[1]&&args[1].method)||(args[0]&&args[0].method)||"GET";var started=Date.now();return originalFetch.apply(this,args).then(function(response){if(!response.ok)send("network",["✕ "+method+" "+url+" · HTTP "+response.status+" · "+(Date.now()-started)+"ms"]);return response}).catch(function(error){send("network",["✕ "+method+" "+url+" · "+(error&&error.message?error.message:"Network request failed")]);throw error})};var XHR=window.XMLHttpRequest;if(XHR){var open=XHR.prototype.open;var sendXhr=XHR.prototype.send;XHR.prototype.open=function(method,url){this.__etMethod=method||"GET";this.__etUrl=safeUrl(url);return open.apply(this,arguments)};XHR.prototype.send=function(){var xhr=this;var started=Date.now();var reported=false;var report=function(){if(reported)return;reported=true;if(xhr.status>=400||xhr.status===0)send("network",["✕ "+(xhr.__etMethod||"GET")+" "+(xhr.__etUrl||"request")+" · "+(xhr.status?"HTTP "+xhr.status:"Network error")+" · "+(Date.now()-started)+"ms"])};xhr.addEventListener("loadend",report,{once:true});return sendXhr.apply(this,arguments)}}window.addEventListener("error",function(e){send("error",[e.message+" (line "+e.lineno+")"])});window.addEventListener("unhandledrejection",function(e){var reason=e.reason;send("error",["Unhandled promise rejection: "+(reason&&reason.message?reason.message:String(reason))])});})();</script>`;

export const VISUAL_SELECT_BRIDGE = `<style id="experts-visual-select-style">html[data-experts-select="on"] *:hover{outline:2px solid #3B82F6!important;outline-offset:2px!important;box-shadow:0 0 0 4px rgba(59,130,246,.22)!important;cursor:crosshair!important}html[data-experts-select="on"]{cursor:crosshair!important}</style><script>(function(){function selector(el){if(el.id)return "#"+CSS.escape(el.id);var parts=[];while(el&&el.nodeType===1&&el!==document.documentElement){var part=el.tagName.toLowerCase();if(el.classList&&el.classList.length)part+="."+Array.from(el.classList).slice(0,2).map(function(x){return CSS.escape(x)}).join(".");var parent=el.parentElement;if(parent){var siblings=Array.from(parent.children).filter(function(x){return x.tagName===el.tagName});if(siblings.length>1)part+=":nth-of-type("+(siblings.indexOf(el)+1)+")"}parts.unshift(part);el=parent}return parts.join(" > ")}document.addEventListener("dblclick",function(event){if(document.documentElement.dataset.expertsSelect!=="on")return;var el=event.target;if(!(el instanceof Element))return;if(!/^(H[1-6]|P|BUTTON|A|SPAN|DIV|LI|LABEL)$/.test(el.tagName))return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();var original=(el.innerText||el.textContent||"").trim();if(!original)return;el.setAttribute("contenteditable","true");el.style.outline="2px solid #22c55e";el.focus();var finish=function(){el.removeAttribute("contenteditable");el.style.outline="";var updated=(el.innerText||el.textContent||"").trim();if(updated&&updated!==original)parent.postMessage({__agentInlineTextEdit:{originalText:original,newText:updated}},"*")};el.addEventListener("blur",finish,{once:true})},true);document.addEventListener("click",function(event){if(document.documentElement.dataset.expertsSelect!=="on")return;var el=event.target;if(!(el instanceof Element))return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();var style=getComputedStyle(el);parent.postMessage({__agentSelection:true,element:{tag:el.tagName.toLowerCase(),selector:selector(el),id:el.id||"",classes:typeof el.className==="string"?el.className:"",text:(el.innerText||el.textContent||"").trim().slice(0,300),outerHTML:el.outerHTML.slice(0,1000),styles:{color:style.color,backgroundColor:style.backgroundColor,fontSize:style.fontSize,fontWeight:style.fontWeight,margin:style.margin,padding:style.padding,borderRadius:style.borderRadius}}},"*")},true);window.addEventListener("message",function(event){if(event.data&&event.data.__agentVisualSelect){document.documentElement.dataset.expertsSelect=event.data.enabled?"on":"off"}})})();</script>`;

/** Same as buildSrcDoc but forwards console output to the parent window. */
export function buildSrcDocWithConsole(files: ProjectFiles): string {
  const html = buildSrcDoc(files);
  const bridges = CONSOLE_BRIDGE + VISUAL_SELECT_BRIDGE;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + bridges);
  return bridges + html;
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app"
  );
}
