import type { ProjectFiles } from "@/lib/sandbox";

export type AgentFramework = "nextjs" | "tanstack" | "vite" | "vue" | "sveltekit" | "node" | "html";
export const FRAMEWORK_OPTIONS = [
  { value: "auto", label: "Auto-Detect (AI)" },
  { value: "nextjs", label: "Next.js 15" },
  { value: "tanstack", label: "TanStack Start" },
  { value: "vite", label: "React + Vite" },
  { value: "vue", label: "Vue 3" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "node", label: "Node.js API" },
  { value: "html", label: "HTML/JS" },
] as const;

export function detectAgentFramework(prompt: string): AgentFramework {
  const p = prompt.toLowerCase();
  if (/sveltekit|svelte/.test(p)) return "sveltekit";
  if (/vue\s*3?|vue\.js/.test(p)) return "vue";
  if (/tanstack/.test(p)) return "tanstack";
  if (/next(?:\.js|js)?|server.?render|app router/.test(p)) return "nextjs";
  if (/node(?:\.js)? api|express api|backend api|rest api/.test(p)) return "node";
  if (/html\s*\/\s*js|vanilla|plain javascript|static website/.test(p)) return "html";
  return "vite";
}

const css = "*{box-sizing:border-box}html,body,#root,#app{min-height:100%;margin:0}body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#0b1020;color:#e8eefc}";
const pkg = (name: string, scripts: Record<string,string>, dependencies: Record<string,string>, devDependencies: Record<string,string> = {}) =>
  JSON.stringify({name:name.toLowerCase().replace(/[^a-z0-9-]+/g,"-") || "experts-app",private:true,type:"module",scripts,dependencies,devDependencies},null,2);

export function createFrameworkStarterFiles(framework: AgentFramework, name: string): ProjectFiles {
  switch (framework) {
    case "nextjs": return {
      "package.json":pkg(name,{dev:"next dev --hostname 0.0.0.0",build:"next build",start:"next start --hostname 0.0.0.0"},{"next":"15.5.9","react":"19.1.0","react-dom":"19.1.0"},{"typescript":"^5.8.3","@types/react":"^19.2.0","@types/node":"^22.16.5"}),
      "next.config.mjs":"export default { poweredByHeader: false };",
      "tsconfig.json":JSON.stringify({compilerOptions:{target:"ES2017",lib:["dom","dom.iterable","esnext"],strict:true,noEmit:true,esModuleInterop:true,module:"esnext",moduleResolution:"bundler",jsx:"preserve",plugins:[{name:"next"}],paths:{"@/*":["./src/*"]}},include:["**/*.ts","**/*.tsx",".next/types/**/*.ts"]},null,2),
      "src/app/layout.tsx":'import type { ReactNode } from "react"; import "./globals.css"; export const metadata={title:"ExpertsTeam App"}; export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body>{children}</body></html>}',
      "src/app/page.tsx":'export default function Home(){return <main><h1>Welcome to your Next.js app</h1><p>Built with ExpertsTeam.</p></main>}',
      "src/app/globals.css":css+"main{padding:40px}",
      "src/app/api/health/route.ts":'export async function GET(){return Response.json({ok:true})}',
      ".gitignore":"node_modules\n.next\n.env*\n",
    };
    case "tanstack": return {
      "package.json":pkg(name,{dev:"vite --host 0.0.0.0",build:"vite build",start:"vite preview --host 0.0.0.0"},{"@tanstack/react-router":"^1.170.41","@tanstack/react-start":"^1.168.60","react":"^19.2.0","react-dom":"^19.2.0"},{"@tanstack/router-plugin":"^1.168.42","@vitejs/plugin-react":"^5.2.0","vite":"^8.1.5","typescript":"^5.8.3"}),
      "vite.config.ts":'import {defineConfig} from "vite"; import {tanstackStart} from "@tanstack/react-start/plugin/vite"; import react from "@vitejs/plugin-react"; export default defineConfig({plugins:[tanstackStart(),react()],server:{host:"0.0.0.0"}})',
      "src/routes/__root.tsx":'import {createRootRoute,Outlet} from "@tanstack/react-router"; export const Route=createRootRoute({component:()=> <Outlet/>});',
      "src/routes/index.tsx":'import {createFileRoute} from "@tanstack/react-router"; export const Route=createFileRoute("/")({component:()=> <main><h1>TanStack Start</h1><p>Built with ExpertsTeam.</p></main>});',
      "src/main.tsx":'import {StrictMode} from "react"; import {createRoot} from "react-dom/client"; import {RouterProvider,createRouter} from "@tanstack/react-router"; import {routeTree} from "./routeTree.gen"; const router=createRouter({routeTree}); createRoot(document.getElementById("root")!).render(<StrictMode><RouterProvider router={router}/></StrictMode>);',
      "index.html":'<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
    };
    case "vue": return {
      "package.json":pkg(name,{dev:"vite --host 0.0.0.0",build:"vite build",preview:"vite preview --host 0.0.0.0"},{"vue":"^3.5.13"},{"@vitejs/plugin-vue":"^5.2.1","vite":"^6.1.0","typescript":"^5.8.3"}),
      "vite.config.ts":'import {defineConfig} from "vite"; import vue from "@vitejs/plugin-vue"; export default defineConfig({plugins:[vue()],server:{host:"0.0.0.0"}})',
      "index.html":'<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
      "src/main.ts":'import {createApp} from "vue"; import App from "./App.vue"; import "./style.css"; createApp(App).mount("#app");',
      "src/App.vue":'<script setup lang="ts">import {ref} from "vue"; const count=ref(0);</script><template><main><h1>Vue 3 with ExpertsTeam</h1><button @click="count++">Clicked {{count}} times</button></main></template>',
      "src/style.css":css+"main{padding:40px}",
    };
    case "sveltekit": return {
      "package.json":pkg(name,{dev:"vite dev --host 0.0.0.0",build:"vite build",preview:"vite preview --host 0.0.0.0"},{"@sveltejs/kit":"^2.20.0","svelte":"^5.20.0","@sveltejs/adapter-auto":"^6.0.0"},{"@sveltejs/vite-plugin-svelte":"^5.0.3","vite":"^6.1.0","typescript":"^5.8.3"}),
      "svelte.config.js":'import adapter from "@sveltejs/adapter-auto"; export default {kit:{adapter:adapter()}};',
      "vite.config.ts":'import {sveltekit} from "@sveltejs/kit/vite"; import {defineConfig} from "vite"; export default defineConfig({plugins:[sveltekit()],server:{host:"0.0.0.0"}})',
      "src/app.html":'<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div style="display:contents">%sveltekit.body%</div></body></html>',
      "src/routes/+page.svelte":'<script lang="ts">let count=$state(0);</script><main><h1>SvelteKit with ExpertsTeam</h1><button onclick={()=>count++}>Clicked {count} times</button></main>',
      "src/routes/+layout.svelte":"<slot />",
    };
    case "node": return {
      "package.json":pkg(name,{dev:"node --watch src/server.js",start:"node src/server.js"},{"express":"^5.1.0"}),
      "src/server.js":'import express from "express"; const app=express(); app.use(express.json()); app.get("/api/health",(_req,res)=>res.json({ok:true})); app.get("/",(_req,res)=>res.send("ExpertsTeam Node API is running")); const port=Number(process.env.PORT||3000); app.listen(port,"0.0.0.0",()=>console.log("API listening on "+port));',
    };
    case "html": return {
      "package.json":pkg(name,{dev:"vite --host 0.0.0.0",build:"vite build",preview:"vite preview --host 0.0.0.0"},{},{"vite":"^6.1.0"}),
      "index.html":'<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>ExpertsTeam App</title></head><body><main><h1>Welcome</h1></main><script type="module" src="/src/main.js"></script></body></html>',
      "src/main.js":'console.log("ExpertsTeam app ready");',
      "src/style.css":css+"main{padding:40px}",
    };
    case "vite":
    default: return {
      "package.json":pkg(name,{dev:"vite --host 0.0.0.0",build:"vite build",preview:"vite preview --host 0.0.0.0"},{"react":"^19.2.0","react-dom":"^19.2.0"},{"@vitejs/plugin-react":"^5.2.0","vite":"^8.1.5","typescript":"^5.8.3","@types/react":"^19.2.0","@types/react-dom":"^19.2.0"}),
      "vite.config.ts":'import {defineConfig} from "vite"; import react from "@vitejs/plugin-react"; export default defineConfig({plugins:[react()],server:{host:"0.0.0.0"}})',
      "index.html":'<!doctype html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>ExpertsTeam App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
      "src/main.tsx":'import React from "react"; import {createRoot} from "react-dom/client"; import App from "./App"; import "./index.css"; createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);',
      "src/App.tsx":'export default function App(){return <main><h1>React + Vite</h1><p>Built with ExpertsTeam.</p></main>}',
      "src/index.css":css+"main{padding:40px}",
      "tsconfig.json":JSON.stringify({compilerOptions:{target:"ES2022",lib:["ES2022","DOM","DOM.Iterable"],module:"ESNext",moduleResolution:"bundler",strict:true,noEmit:true,jsx:"react-jsx",skipLibCheck:true},include:["src"]},null,2),
    };
  }
}
