"use client";
import { useEffect, useMemo, useRef, useState } from "react";

/** 省略説明：ブロック型Markdownエディタ（機能フル） */

const TYPE_OPTIONS = [
  { value: "title", label: "タイトル (H1)" },
  { value: "h2", label: "見出し1 (H2)" },
  { value: "h3", label: "見出し2 (H3)" },
  { value: "h4", label: "見出し3 (H4)" },
  { value: "h5", label: "見出し4 (H5)" },
  { value: "h6", label: "見出し5 (H6)" },
  { value: "p", label: "本文" },
  { value: "quote", label: "引用" },
  { value: "code", label: "コード (言語指定)" },
  { value: "ul", label: "箇条書きリスト" },
  { value: "ol", label: "番号付きリスト" },
  { value: "check", label: "チェックリスト" },
  { value: "hr", label: "区切り線" },
  { value: "image", label: "画像 (URL)" },
];

const typeToMarkdownPrefix = (type: string) =>
  (
    ({
      title: "# ",
      h2: "## ",
      h3: "### ",
      h4: "#### ",
      h5: "##### ",
      h6: "###### ",
      quote: "> ",
    }) as Record<string, string>
  )[type] || "";

type Block = {
  id: string;
  type: string;
  text: string;
  lang?: string;
  collapsed?: boolean;
};

const newBlock = (type = "p"): Block => ({
  id: crypto.randomUUID(),
  type,
  text: "",
  lang: "",
  collapsed: false,
});

const useLocalStorage = <T,>(key: string, initial: T) => {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state]);
  return [state, setState] as const;
};

function sanitizeHtml(html: string) {
  const div = document.createElement("div");
  div.innerHTML = html;
  div
    .querySelectorAll("script,style,iframe,object,embed")
    .forEach((n) => n.remove());
  const walk = (node: Node) => {
    if (node.nodeType === 1) {
      const el = node as HTMLElement;
      [...el.attributes].forEach((a) => {
        if (/^on/i.test(a.name) || /javascript:/i.test(a.value))
          el.removeAttribute(a.name);
      });
      el.childNodes.forEach(walk);
    }
  };
  walk(div);
  return div.innerHTML;
}

function listLinesToMarkdown(text: string, kind: "ul" | "ol" | "check") {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const md = lines.map((raw) => {
    const m = raw.match(/^(\t+|(?:  )+)?(.*)$/) || [];
    const indentStr = (m[1] as string) || "";
    const body = ((m[2] as string) || "").trimEnd();
    const level = indentStr
      ? Math.floor(indentStr.replace(/\t/g, "  ").length / 2)
      : 0;
    const lead = "  ".repeat(level);
    if (kind === "ul") return `${lead}- ${body}`;
    if (kind === "ol") return `${lead}1. ${body}`;
    if (kind === "check") {
      const hasBox = /^\[( |x|X)\]\s/.test(body);
      return `${lead}- ${hasBox ? body : "[ ] " + body}`;
    }
    return body;
  });
  return md.join("\n");
}

function blocksToMarkdown(blocks: Block[]) {
  const out: string[] = [];
  blocks.forEach((b) => {
    const text = (b.text || "").replace(/\r\n?/g, "\n").trimEnd();
    switch (b.type) {
      case "hr":
        out.push("---");
        break;
      case "image":
        out.push(`![image](${text})`);
        break;
      case "code":
        out.push("```" + (b.lang || ""), text, "```");
        break;
      case "ul":
        out.push(listLinesToMarkdown(text, "ul"));
        break;
      case "ol":
        out.push(listLinesToMarkdown(text, "ol"));
        break;
      case "check":
        out.push(listLinesToMarkdown(text, "check"));
        break;
      case "p":
        out.push(text);
        break;
      case "quote": {
        const q = text
          .split("\n")
          .map((l) => "> " + l)
          .join("\n");
        out.push(q);
        break;
      }
      case "title":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        out.push(typeToMarkdownPrefix(b.type) + text);
        break;
      default:
        out.push(text);
    }
  });
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n");
}

function markdownToHtml(md: string) {
  let html = md;
  html = html.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!
  );
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, lang, code) => {
    const cls = lang ? ` class="language-${lang}"` : "";
    return `<pre><code${cls}>${String(code).replace(
      /\n/g,
      "<br>"
    )}</code></pre>`;
  });
  html = html
    .replace(/^######\s+(.+)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>")
    .replace(/^####\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/^---$/gm, "<hr>");
  html = html.replace(/^(>\s.*(?:\n>\s.*)*)/gm, (m) => {
    const inner = m.replace(/^>\s?/gm, "");
    return `<blockquote>${inner.replace(/\n/g, "<br>")}</blockquote>`;
  });
  html = html.replace(/^(\s*)- \[( |x|X)\] (.*)$/gm, (_m, sp, chk, body) => {
    const checked = /x/i.test(chk) ? " checked" : "";
    return `${sp}<input type="checkbox" disabled${checked}> ${body}`;
  });
  html = html.replace(/^(\s*)-\s+(.*)$/gm, "$1• $2");
  html = html.replace(/^(\s*)\d+\.\s+(.*)$/gm, "$11) $2");
  html = html.replace(
    /\[(.+?)\]\((.+?)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html
    .split(/\n\n+/)
    .map((blk) => {
      if (/^<(h\d|pre|blockquote|hr)/.test(blk)) return blk;
      return `<p>${blk.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
  return sanitizeHtml(html);
}
// 共通ボタンスタイル（白黒統一）
const BTN =
  "px-3 py-1.5 rounded border bg-[#355273] text-white hover:bg-[#355273]/80 border-black dark:border-white";
const BTN_SM =
  "text-sm px-2 py-1 rounded border bg-[#355273] text-white hover:bg-[#355273]/80 border-black dark:border-white";

export default function MarkdownBlockEditor() {
  const [blocks, setBlocks] = useLocalStorage<Block[]>("md_blocks_v2", [
    newBlock("title"),
    newBlock("p"),
  ]);
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [theme, setTheme] = useLocalStorage<"light" | "dark">(
    "md_theme",
    "light"
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLTextAreaElement | null;

      // Ctrl/Cmd+Enter で次のブロック
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        const id = (target as any)?.dataset?.blockId as string | undefined;
        if (!id) return;
        const idx = blocks.findIndex((b) => b.id === id);
        addBlock(idx);
        e.preventDefault();
      }

      // Tab でインデント / Shift+Tab で戻す（textareaのみ）
      if (target?.tagName === "TEXTAREA" && e.key === "Tab") {
        e.preventDefault();
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const before = target.value.slice(0, start);
        const sel = target.value.slice(start, end);
        const after = target.value.slice(end);
        const inserted = e.shiftKey
          ? sel.replace(/^((?:\t|  ))/gm, "")
          : sel.replace(/^/gm, "  ");
        const next = before + inserted + after;
        const id = target.dataset.blockId!;
        updateBlock(id, { text: next }); // ← これが抜けてた！

        const delta = inserted.length - sel.length;
        requestAnimationFrame(() => {
          target.selectionStart = start + delta;
          target.selectionEnd = end + delta;
        });
      }
    };
    el.addEventListener("keydown", handler as any);
    return () => el.removeEventListener("keydown", handler as any);
  }, [blocks]);

  const addBlock = (idx = blocks.length - 1, type = "p") => {
    const b = newBlock(type);
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(Math.max(0, idx + 1), 0, b);
      return next;
    });
  };
  const removeBlock = (id: string) =>
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  const moveBlock = (from: number, to: number) =>
    setBlocks((prev) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= prev.length ||
        to >= prev.length
      )
        return prev;
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
  const updateBlock = (id: string, patch: Partial<Block>) =>
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
  const toggleCollapse = (id: string) =>
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, collapsed: !b.collapsed } : b))
    );

  const dragIndex = useRef(-1);

  const applyInline = (kind: "bold" | "italic" | "link") => {
    const ta = document.querySelector(
      `textarea[data-block-id="${activeId}"]`
    ) as HTMLTextAreaElement | null;
    if (!ta) return;
    const start = ta.selectionStart,
      end = ta.selectionEnd;
    const sel =
      ta.value.slice(start, end) || (kind === "link" ? "link" : "text");
    let inserted = sel,
      deltaStart = 0,
      deltaEnd = 0;
    if (kind === "bold") {
      inserted = `**${sel}**`;
      deltaStart = 2;
      deltaEnd = 2;
    }
    if (kind === "italic") {
      inserted = `*${sel}*`;
      deltaStart = 1;
      deltaEnd = 1;
    }
    if (kind === "link") {
      const url = prompt("リンクURLを入力");
      if (!url) return;
      inserted = `[${sel}](${url})`;
    }
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const next = before + inserted + after;
    updateBlock(activeId!, { text: next });

    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = start + deltaStart;
      ta.selectionEnd = start + inserted.length - deltaEnd;
    });
  };

  const markdown = useMemo(() => blocksToMarkdown(blocks), [blocks]);
  const html = useMemo(() => markdownToHtml(markdown), [markdown]);

  const copy = async (text: string, which: "md" | "html") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "md") setCopiedMd(true);
      else setCopiedHtml(true);
      setTimeout(() => {
        setCopiedMd(false);
        setCopiedHtml(false);
      }, 1200);
    } catch {
      alert("コピーに失敗しました");
    }
  };

  const downloadFile = (
    filename: string,
    content: string,
    mime = "text/plain"
  ) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importPlain = async () => {
    const text = prompt(
      "プレーンテキストを貼り付けてください。空行で段落。\n# / ## などの見出し、`---`で区切り線、`>`で引用、```でコードを取り込みます。"
    );
    if (text == null) return;
    const parts = text
      .replace(/\r\n?/g, "\n")
      .split(/\n\n+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const imported: Block[] = parts.map((t) => {
      if (/^######\s+/.test(t))
        return {
          id: crypto.randomUUID(),
          type: "h6",
          text: t.replace(/^######\s+/, ""),
        };
      if (/^#####\s+/.test(t))
        return {
          id: crypto.randomUUID(),
          type: "h5",
          text: t.replace(/^#####\s+/, ""),
        };
      if (/^####\s+/.test(t))
        return {
          id: crypto.randomUUID(),
          type: "h4",
          text: t.replace(/^####\s+/, ""),
        };
      if (/^###\s+/.test(t))
        return {
          id: crypto.randomUUID(),
          type: "h3",
          text: t.replace(/^###\s+/, ""),
        };
      if (/^##\s+/.test(t))
        return {
          id: crypto.randomUUID(),
          type: "h2",
          text: t.replace(/^##\s+/, ""),
        };
      if (/^#\s+/.test(t))
        return {
          id: crypto.randomUUID(),
          type: "title",
          text: t.replace(/^#\s+/, ""),
        };
      if (/^>\s+/.test(t))
        return {
          id: crypto.randomUUID(),
          type: "quote",
          text: t.replace(/^>\s+/, ""),
        };
      if (/^```[\s\S]*```$/.test(t)) {
        const m = t.match(/^```(\w+)?\n([\s\S]*?)\n?```$/);
        return {
          id: crypto.randomUUID(),
          type: "code",
          lang: m?.[1] || "",
          text: m?.[2] || "",
        };
      }
      if (t === "---") return { id: crypto.randomUUID(), type: "hr", text: "" };
      if (/^!\[(.*?)\]\((.*?)\)$/.test(t)) {
        const m = t.match(/^!\[(.*?)\]\((.*?)\)$/);
        return { id: crypto.randomUUID(), type: "image", text: m?.[2] || "" };
      }
      if (/^(-|\d+\.|- \[( |x|X)\])/.test(t)) {
        if (/^- \[( |x|X)\]/.test(t))
          return {
            id: crypto.randomUUID(),
            type: "check",
            text: t.replace(/^-/, "").trimStart(),
          };
        if (/^\d+\./.test(t))
          return {
            id: crypto.randomUUID(),
            type: "ol",
            text: t.replace(/^\d+\.\s?/, ""),
          };
        return {
          id: crypto.randomUUID(),
          type: "ul",
          text: t.replace(/^-?\s?/, ""),
        };
      }
      return { id: crypto.randomUUID(), type: "p", text: t };
    });
    setBlocks(imported.length ? imported : [newBlock("title"), newBlock("p")]);
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  return (
    <div
      className={`min-h-dvh p-6 ${
        theme === "dark"
          ? "bg-[#355273] text-white" // ダークモード時は #355273
          : "bg-[#D3DBE2] text-black" // ライトモード時は #D3DBE2
      }`}
    >
      <div className="mx-auto max-w-6xl" ref={containerRef}>
        {/* きれいなヘッダー（1つだけ） */}
        <header className="mb-6 rounded-2xl px-4 py-3 shadow border border-black/20 dark:border-white/20 bg-white dark:bg-[#355273]">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              シナリオ制作支援ツール
            </h1>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className={BTN}
              >
                テーマ: {theme === "dark" ? "ダーク" : "ライト"}
              </button>

              <button
                onClick={() => setBlocks([newBlock("title"), newBlock("p")])}
                className={BTN}
              >
                リセット
              </button>

              <button
                onClick={() => addBlock(blocks.length - 1)}
                className={BTN}
              >
                ブロック追加 (Ctrl/Cmd+Enter)
              </button>

              <button onClick={importPlain} className={BTN}>
                テキスト取込
              </button>

              <button
                onClick={() =>
                  downloadFile("document.md", markdown, "text/markdown")
                }
                className={BTN}
              >
                .md保存
              </button>

              <button
                onClick={() =>
                  downloadFile(
                    "document.html",
                    `<!doctype html><html><head><meta charset="utf-8"><title>Export</title></head><body>${html}</body></html>`,
                    "text/html"
                  )
                }
                className={BTN}
              >
                .html保存
              </button>

              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(blocks, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "blocks.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className={BTN}
              >
                JSON保存
              </button>

              <button
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "application/json";
                  input.onchange = () => {
                    const f = input.files?.[0];
                    if (!f) return;
                    const r = new FileReader();
                    r.onload = () => {
                      try {
                        const data = JSON.parse(String(r.result));
                        if (Array.isArray(data)) setBlocks(data);
                      } catch {
                        alert("JSONの読み込みに失敗");
                      }
                    };
                    r.readAsText(f);
                  };
                  input.click();
                }}
                className={BTN}
              >
                JSON読込
              </button>
            </div>{" "}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Editor */}
          <section className="space-y-3">
            {blocks.map((b, idx) => (
              <article
                key={b.id}
                className={`rounded-2xl shadow p-3 border hover:shadow-lg transition
            bg-white dark:bg-[#355273]
            border-black/20 dark:border-white/20
            ${b.collapsed ? "opacity-70" : "opacity-100"}`}
                draggable
                onDragStart={() => (dragIndex.current = idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => moveBlock(dragIndex.current, idx)}
              >
                {/* --- ブロックヘッダー（折りたたみボタン / ドラッグハンドル / セレクトボックス / 操作ボタン群）--- */}
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => toggleCollapse(b.id)}
                    title={b.collapsed ? "展開" : "折りたたむ"}
                    className="px-2 py-1 rounded border bg-[#355273] text-white hover:bg-[#355273]/80
             border-black dark:border-white"
                  >
                    {b.collapsed ? "▸" : "▾"}
                  </button>

                  <span
                    className="cursor-grab select-none px-2 py-1 rounded border bg-[#355273] text-white
                 border-black dark:border-white"
                  >
                    ☰
                  </span>

                  <select
                    className="px-2 py-1 rounded border bg-white text-black
             border-black dark:border-white"
                    value={b.type}
                    onChange={(e) =>
                      updateBlock(b.id, { type: e.target.value })
                    }
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {b.type === "code" && (
                    <input
                      value={b.lang}
                      onChange={(e) =>
                        updateBlock(b.id, { lang: e.target.value })
                      }
                      placeholder="言語 (例: js, ts, py)"
                      className="px-2 py-1 rounded border bg-white text-black
               border-black dark:border-white"
                    />
                  )}

                  <div className="ml-auto flex items-center gap-1">
                    <button
                      title="上へ"
                      onClick={() => moveBlock(idx, Math.max(0, idx - 1))}
                      className="px-2 py-1 rounded border bg-[#355273] text-white hover:bg-[#355273]/80
               border-black dark:border-white"
                    >
                      ↑
                    </button>
                    <button
                      title="下へ"
                      onClick={() =>
                        moveBlock(idx, Math.min(blocks.length - 1, idx + 1))
                      }
                      className="px-2 py-1 rounded border bg-[#355273] text-white hover:bg-[#355273]/80
               border-black dark:border-white"
                    >
                      ↓
                    </button>
                    <button
                      title="削除"
                      onClick={() => removeBlock(b.id)}
                      className="px-2 py-1 rounded border bg-[#355273] text-white hover:bg-[#355273]/80
               border-black dark:border-white"
                    >
                      削除
                    </button>
                  </div>
                </div>

                {[
                  "p",
                  "title",
                  "h2",
                  "h3",
                  "h4",
                  "h5",
                  "h6",
                  "quote",
                  "ul",
                  "ol",
                  "check",
                ].includes(b.type) && (
                  <div className="flex gap-2 mb-2 text-sm">
                    <button
                      onClick={() => applyInline("bold")}
                      className={BTN_SM}
                    >
                      **太字**
                    </button>
                    <button
                      onClick={() => applyInline("italic")}
                      className={BTN_SM}
                    >
                      *斜体*
                    </button>
                    <button
                      onClick={() => applyInline("link")}
                      className={BTN_SM}
                    >
                      リンク
                    </button>
                  </div>
                )}
                {/* 入力エリア */}
                {!b.collapsed ? (
                  b.type === "hr" ? (
                    <div className="text-center text-slate-400">
                      ---（区切り線）
                    </div>
                  ) : b.type === "image" ? (
                    <input
                      data-block-id={b.id}
                      value={b.text}
                      onFocus={() => setActiveId(b.id)}
                      onChange={(e) =>
                        updateBlock(b.id, { text: e.target.value })
                      }
                      placeholder="画像のURLを入力 (例: https://...)"
                      className="w-full rounded-xl border border-slate-300 dark:border-slate-600 
                 p-3 bg-white text-slate-800 placeholder-slate-400"
                    />
                  ) : b.type === "code" ? (
                    <textarea
                      data-block-id={b.id}
                      value={b.text}
                      onFocus={() => setActiveId(b.id)}
                      onChange={(e) =>
                        updateBlock(b.id, { text: e.target.value })
                      }
                      className="w-full min-h-[140px] rounded-xl border border-slate-300 
                 dark:border-slate-600 p-3 bg-white text-slate-800 
                 placeholder-slate-400 font-mono text-sm"
                      placeholder="コードを入力 (Tabでインデント)"
                    />
                  ) : (
                    <textarea
                      data-block-id={b.id}
                      value={b.text}
                      onFocus={() => setActiveId(b.id)}
                      onChange={(e) =>
                        updateBlock(b.id, { text: e.target.value })
                      }
                      className={`w-full rounded-xl border border-slate-300 dark:border-slate-600 
                 p-3 bg-white text-slate-800 placeholder-slate-400 ${
                   b.type === "title" || b.type.startsWith("h")
                     ? "text-xl font-semibold"
                     : ""
                 }`}
                      placeholder={
                        b.type === "title"
                          ? "タイトルを入力"
                          : b.type.startsWith("h")
                            ? "見出しを入力"
                            : b.type === "quote"
                              ? "引用文を入力"
                              : ["ul", "ol", "check"].includes(b.type)
                                ? "1行=1項目。Tab/スペースで入れ子。チェックは [ ] / [x] から"
                                : "本文を入力"
                      }
                      rows={
                        ["title", "h2", "h3", "h4", "h5", "h6"].includes(b.type)
                          ? 1
                          : 4
                      }
                    />
                  )
                ) : (
                  /* 折りたたみ時のサマリー表示（1行だけ表示） */
                  <div className="text-sm text-slate-500 truncate px-1">
                    <span className="mr-2 rounded bg-slate-100 dark:bg-slate-700 px-2 py-0.5">
                      {TYPE_OPTIONS.find((o) => o.value === b.type)?.label ??
                        b.type}
                    </span>
                    {String(b.text || "").split("\n")[0] || "(空)"}
                  </div>
                )}

                <div className="mt-2 flex justify-between text-xs text-slate-500  text-white">
                  <span>文字数: {b.text.length}</span>
                  <div className="flex gap-2">
                    <button onClick={() => addBlock(idx)} className={BTN_SM}>
                      下に追加
                    </button>
                    <div className="text-slate-400">ドラッグで並べ替え</div>
                  </div>
                </div>
              </article>
            ))}
          </section>

          {/* Preview */}
          <section className="rounded-2xl shadow border p-4 bg-white dark:bg-[#355273] border-black/20 dark:border-white/20">
            <h2 className="text-lg font-bold mb-2 text-white">
              出力プレビュー
            </h2>
            <div className="grid grid-cols-1 gap-4">
              {/* Markdown */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-white">Markdown</h3>
                  <button
                    onClick={() => copy(markdown, "md")}
                    className={BTN_SM}
                  >
                    コピー
                  </button>
                </div>
                <pre
                  className="whitespace-pre-wrap break-words text-sm p-3 rounded-xl border max-h-[32vh] overflow-auto
                bg-white dark:bg-[#355273] border-black/20 dark:border-white/20
                text-black dark:text-white"
                >
                  {markdown}
                </pre>
                {copiedMd && (
                  <div className="text-right text-xs">コピーしました</div>
                )}
              </div>

              {/* HTML */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-white">HTML</h3>
                  <button onClick={() => copy(html, "html")} className={BTN_SM}>
                    コピー
                  </button>
                </div>
                <pre
                  className="whitespace-pre-wrap break-words text-sm p-3 rounded-xl border max-h-[32vh] overflow-auto
                bg-white dark:bg-[#355273] border-black/20 dark:border-white/20
                text-black dark:text-white"
                >
                  {html}
                </pre>

                {copiedHtml && (
                  <div className="text-right text-xs">コピーしました</div>
                )}
              </div>

              {/* ライブレンダリング */}
              <h3 className="font-semibold text-white">
                ライブレンダリング（HTML適用）
              </h3>
              <div
                className="p-3 rounded-xl border max-w-none
             bg-white dark:bg-[#355273] border-black/20 dark:border-white/20
             text-black dark:text-white"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>

            <div className="mt-3 text-xs opacity-70 text-white">
              ヒント：Tab でインデント、Shift+Tab で戻す。チェックリストは「[
              ]」「[x]」でON/OFF。
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
