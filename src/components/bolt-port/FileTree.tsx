/**
 * Adapted from StackBlitz Bolt.new's app/components/workbench/FileTree.tsx.
 * Copyright (c) StackBlitz, Inc. (2024). MIT License.
 *
 * Keeps Bolt's hierarchical, collapsible explorer behavior while accepting
 * ExpertsTeam's persisted project paths as props instead of Bolt's FileMap store.
 */
import { useMemo, useState } from "react";
import { ChevronRight, Circle, FileCode2, Folder, FolderOpen } from "lucide-react";

type FileNode = { name: string; path: string; children: FileNode[]; isFile: boolean };

type BoltFileTreeProps = {
  paths: string[];
  selectedPath: string;
  onSelect: (path: string) => void;
};

function buildTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];
  for (const path of paths) {
    if (!path || /(^|\/)(node_modules|\.git|\.next|\.astro)(\/|$)/.test(path)) continue;
    const parts = path.split("/").filter(Boolean);
    let level = root;
    let currentPath = "";
    parts.forEach((part, index) => {
      currentPath = currentPath ? currentPath + "/" + part : part;
      const isFile = index === parts.length - 1;
      let node = level.find((item) => item.name === part && item.isFile === isFile);
      if (!node) {
        node = { name: part, path: currentPath, children: [], isFile };
        level.push(node);
      }
      level = node.children;
    });
  }
  const sort = (nodes: FileNode[]) => {
    nodes.sort((a, b) => Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    nodes.forEach((node) => sort(node.children));
  };
  sort(root);
  return root;
}

export function BoltFileTree({ paths, selectedPath, onSelect }: BoltFileTreeProps) {
  const tree = useMemo(() => buildTree(paths), [paths]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const renderNodes = (nodes: FileNode[], depth = 0) => nodes.map((node) => {
    const isSelected = node.isFile && selectedPath === node.path;
    const isCollapsed = collapsed.has(node.path);
    if (node.isFile) {
      return (
        <button key={node.path} type="button" onClick={() => onSelect(node.path)}
          aria-current={isSelected ? "page" : undefined}
          className={`group flex w-full min-w-0 items-center gap-2 rounded-md border border-transparent py-1.5 pr-2 text-left text-[11px] transition ${isSelected ? "border-sky-400/20 bg-sky-400/10 text-sky-100" : "text-[#a1a1aa] hover:bg-white/[0.055] hover:text-white"}`}
          style={{ paddingLeft: 8 + depth * 14 }}>
          <FileCode2 size={13} className="shrink-0 opacity-80"/>
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {isSelected && <Circle size={5} className="shrink-0 fill-sky-300 text-sky-300"/>}
        </button>
      );
    }
    return (
      <div key={node.path}>
        <button type="button" aria-expanded={!isCollapsed}
          onClick={() => setCollapsed((current) => {
            const next = new Set(current);
            if (next.has(node.path)) next.delete(node.path); else next.add(node.path);
            return next;
          })}
          className="group flex w-full min-w-0 items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-[11px] text-[#b4b4bc] transition hover:bg-white/[0.055] hover:text-white"
          style={{ paddingLeft: 6 + depth * 14 }}>
          <ChevronRight size={12} className={`shrink-0 transition-transform ${isCollapsed ? "" : "rotate-90"}`}/>
          {isCollapsed ? <Folder size={13} className="shrink-0 text-[#8b98aa]"/> : <FolderOpen size={13} className="shrink-0 text-sky-300"/>}
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        </button>
        {!isCollapsed && <div>{renderNodes(node.children, depth + 1)}</div>}
      </div>
    );
  });

  if (!tree.length) return <p className="px-2 py-3 text-[10px] text-[#66666e]">No files yet</p>;
  return <div className="space-y-0.5">{renderNodes(tree)}</div>;
}
