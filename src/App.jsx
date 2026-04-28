/* ── Plugin SDK access ─────────────────────────────────────────── */
const { React, hooks, components, utils, api } = window.__HERMES_PLUGIN_SDK__;
const { useState, useEffect, useRef, useCallback } = hooks;
const { Button, Badge } = components;
const { cn, timeAgo } = utils;

/* Make React available for classic JSX transform */
if (!window.React) window.React = React;

/* ── Load highlight.js + dark theme ────────────────────────────── */
if (!window.hljs) {
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
  script.async = true;
  document.head.appendChild(script);
}
if (!document.getElementById("hljs-dark-theme")) {
  const link = document.createElement("link");
  link.id = "hljs-dark-theme";
  link.rel = "stylesheet";
  link.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";
  document.head.appendChild(link);
}

/* ── Import marked for Markdown rendering ──────────────────────── */
import { marked } from "marked";

/* ── Markdown inline renderer ──────────────────────────────────── */
function renderInline(tokens, keyPrefix) {
  if (!tokens || !tokens.length) return [];
  return tokens.map((tok, i) => {
    const key = `${keyPrefix}-i${i}`;
    switch (tok.type) {
      case "text":
      case "raw":
      case "escape":
        return <span key={key}>{tok.text || tok.raw}</span>;
      case "strong":
        return (
          <strong key={key} className="font-semibold text-foreground">
            {renderInline(tok.tokens, `${keyPrefix}-${i}`)}
          </strong>
        );
      case "em":
        return (
          <em key={key} className="italic text-foreground">
            {renderInline(tok.tokens, `${keyPrefix}-${i}`)}
          </em>
        );
      case "codespan":
        return (
          <code
            key={key}
            className="px-1.5 py-0.5 rounded bg-muted/80 text-foreground font-mono text-[11px] border border-border/30"
          >
            {tok.text}
          </code>
        );
      case "link":
        return (
          <a
            key={key}
            href={tok.href}
            title={tok.title || ""}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline decoration-primary/50"
          >
            {renderInline(tok.tokens, `${keyPrefix}-${i}`)}
          </a>
        );
      case "image":
        return (
          <div key={key} className="my-2 rounded-lg overflow-hidden border border-border/30 shadow-sm">
            <img
              src={tok.href}
              alt={tok.text || "Image"}
              className="max-w-full h-auto block"
              loading="lazy"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          </div>
        );
      case "del":
        return (
          <del key={key} className="text-muted-foreground">
            {renderInline(tok.tokens, `${keyPrefix}-${i}`)}
          </del>
        );
      case "br":
        return <br key={key} />;
      case "html":
        return <span key={key} dangerouslySetInnerHTML={{ __html: tok.raw }} />;
      default:
        return <span key={key}>{tok.text || tok.raw}</span>;
    }
  });
}

/* ── Markdown block renderer ───────────────────────────────────── */
function renderBlocks(tokens, keyPrefix, fontSize) {
  if (!tokens || !tokens.length) return null;
  return tokens.map((tok, i) => {
    const key = `${keyPrefix}-b${i}`;
    switch (tok.type) {
      case "heading": {
        const headingClasses = {
          1: "text-2xl font-bold mt-4 mb-2",
          2: "text-xl font-semibold mt-3 mb-2",
          3: "text-lg font-semibold mt-3 mb-1.5",
          4: "text-base font-medium mt-2 mb-1",
          5: "text-sm font-medium mt-2 mb-1",
          6: "text-xs font-medium mt-2 mb-1 text-muted-foreground",
        };
        return (
          <div key={key} className={headingClasses[tok.depth] || headingClasses[3]}>
            {renderInline(tok.tokens, `${keyPrefix}-${i}`)}
          </div>
        );
      }
      case "paragraph":
        return (
          <p key={key} className="my-1.5 text-foreground leading-relaxed">
            {renderInline(tok.tokens, `${keyPrefix}-${i}`)}
          </p>
        );
      case "text":
        return (
          <p key={key} className="my-1 text-foreground">
            {renderInline(tok.tokens, `${keyPrefix}-${i}`)}
          </p>
        );
      case "code":
        return <CodeBlock key={key} code={tok.text} lang={tok.lang || ""} fontSize={fontSize} />;
      case "blockquote":
        return (
          <blockquote
            key={key}
            className="border-l-2 border-primary/40 pl-3 my-2 italic text-muted-foreground"
          >
            {renderInline(tok.tokens, `${keyPrefix}-${i}`)}
          </blockquote>
        );
      case "list": {
        const ListTag = tok.ordered ? "ol" : "ul";
        return (
          <ListTag
            key={key}
            className={
              tok.ordered
                ? "list-decimal pl-5 my-2 space-y-0.5"
                : "list-disc pl-5 my-2 space-y-0.5"
            }
          >
            {tok.items.map((item, j) => {
              const itemKey = `${key}-li${j}`;
              const itemTokens = item.tokens || [];
              const inlineTokens = itemTokens.filter((t) => t.type !== "list");
              const nestedLists = itemTokens.filter((t) => t.type === "list");
              return (
                <li key={itemKey} className="text-foreground leading-relaxed">
                  {renderInline(inlineTokens, `${keyPrefix}-${i}-${j}`)}
                  {item.task && (
                    <span className="ml-1 text-muted-foreground text-xs">
                      [{item.checked ? "x" : " "}]
                    </span>
                  )}
                  {nestedLists.length > 0 &&
                    renderBlocks(nestedLists, `${keyPrefix}-${i}-${j}`, fontSize)}
                </li>
              );
            })}
          </ListTag>
        );
      }
      case "table": {
        const aligns = tok.align || [];
        return (
          <div key={key} className="my-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-border/40 rounded-md">
              <thead>
                <tr className="bg-muted/50">
                  {tok.header.map((cell, j) => (
                    <th
                      key={`${key}-th${j}`}
                      className={cn(
                        "px-3 py-2 text-left text-xs font-semibold text-foreground border-b border-border/40",
                        aligns[j] === "center" && "text-center",
                        aligns[j] === "right" && "text-right"
                      )}
                    >
                      {renderInline(cell.tokens, `${keyPrefix}-${i}-h${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tok.rows.map((row, r) => (
                  <tr
                    key={`${key}-tr${r}`}
                    className="border-b border-border/20 last:border-b-0 hover:bg-accent/20"
                  >
                    {row.map((cell, j) => (
                      <td
                        key={`${key}-td${r}-${j}`}
                        className={cn(
                          "px-3 py-2 text-foreground",
                          aligns[j] === "center" && "text-center",
                          aligns[j] === "right" && "text-right"
                        )}
                      >
                        {renderInline(cell.tokens, `${keyPrefix}-${i}-r${r}c${j}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      case "hr":
        return <hr key={key} className="my-3 border-border/40" />;
      case "space":
        return null;
      case "html":
        return <div key={key} dangerouslySetInnerHTML={{ __html: tok.text }} />;
      default:
        return <p key={key} className="text-foreground">{tok.text}</p>;
    }
  });
}

/* ── MarkdownContent component ─────────────────────────────────── */
function MarkdownContent({ text, fontSize }) {
  if (!text) return null;
  const tokens = marked.lexer(text, { gfm: true, breaks: false });
  return <div className="markdown-content">{renderBlocks(tokens, "md", fontSize)}</div>;
}

/* ── Helpers ───────────────────────────────────────────────────── */
function genId() {
  return "f_" + Math.random().toString(36).slice(2, 9);
}

function loadFolderState() {
  try {
    const raw = localStorage.getItem("hermes-chat-folders");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { folders: [], assignments: {} };
}

function saveFolderState(state) {
  try {
    localStorage.setItem("hermes-chat-folders", JSON.stringify(state));
  } catch {}
}

/* ── CodeBlock ─────────────────────────────────────────────────── */
function CodeBlock({ code, lang, fontSize }) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const codeStyle = fontSize ? { fontSize: `${fontSize - 2}px`, lineHeight: 1.6 } : {};

  useEffect(() => {
    function applyHighlight() {
      if (!preRef.current) return;
      if (window.hljs && lang) {
        try {
          const result = window.hljs.highlight(code, { language: lang });
          preRef.current.innerHTML = result.value;
        } catch {
          preRef.current.textContent = code;
        }
      } else {
        preRef.current.textContent = code;
      }
    }
    applyHighlight();
    if (!window.hljs) {
      const timer = setInterval(() => {
        if (window.hljs) {
          applyHighlight();
          clearInterval(timer);
        }
      }, 200);
      return () => clearInterval(timer);
    }
  }, [code, lang]);

  return (
    <div className="group relative bg-muted/80 bg-black/20 rounded-lg p-3 my-2 font-mono text-xs text-foreground overflow-x-auto border border-border/30">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out flex items-center gap-1.5 px-2 py-1 rounded bg-background/80 hover:bg-background text-foreground text-[10px] border border-border/40 cursor-pointer z-10"
        title="Copy to clipboard"
      >
        {copied ? (
          <>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x={9} y={9} width={13} height={13} rx={2} ry={2} />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy
          </>
        )}
      </button>
      {lang && <div className="text-[10px] text-muted-foreground mb-1 select-none">{lang}</div>}
      <pre ref={preRef} className="whitespace-pre-wrap break-words m-0 hljs" style={codeStyle} />
    </div>
  );
}

/* ── ChatBubble ────────────────────────────────────────────────── */
function ChatBubble({ role, content, isStreaming, fontSize, images }) {
  const isUser = role === "user";
  const textStyle = fontSize ? { fontSize: `${fontSize}px`, lineHeight: 1.6 } : {};
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(null);

  const handlePlayTTS = useCallback(async () => {
    if (isPlaying || !content) return;
    setIsPlaying(true);
    setAudioError(null);
    try {
      const res = await fetch("/api/plugins/webui/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content }),
      });
      const data = await res.json();
      if (!data.success || !data.audio_url) {
        throw new Error(data.error || "TTS failed");
      }
      const audio = new Audio(data.audio_url);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => {
        setAudioError("Audio playback failed");
        setIsPlaying(false);
      };
      await audio.play();
    } catch (err) {
      console.error("TTS error:", err);
      setAudioError(err.message);
      setIsPlaying(false);
    }
  }, [isPlaying, content]);

  if (isUser) {
    return (
      <div className="flex w-full mb-3 justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm bg-muted text-foreground border border-border/50">
          <div className="whitespace-pre-wrap break-words" style={textStyle}>{content}</div>
          {isStreaming && <span className="inline-block w-1.5 h-4 ml-1 bg-current align-middle animate-pulse rounded-sm" />}
        </div>
      </div>
    );
  }

  // Extract markdown image URLs to deduplicate against tool-generated images
  const markdownImageUrls = new Set();
  const mdImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let mdMatch;
  while ((mdMatch = mdImgRegex.exec(content)) !== null) {
    markdownImageUrls.add(mdMatch[2]);
  }
  const dedupedImages = (images || []).filter((u) => !markdownImageUrls.has(u));

  return (
    <div className="flex w-full mb-3 justify-start group">
      <div className="max-w-[85%] leading-relaxed" style={textStyle}>
        <MarkdownContent text={content} fontSize={fontSize} />
        {dedupedImages.length > 0 &&
          dedupedImages.map((url, idx) => (
            <div
              key={`toolimg-${idx}`}
              className="my-2 rounded-lg overflow-hidden border border-border/30 shadow-sm"
            >
              <img
                src={url}
                alt="Generated image"
                className="max-w-full h-auto block"
                loading="lazy"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            </div>
          ))}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 ml-1 bg-current align-middle animate-pulse rounded-sm" />
        )}
        {!isStreaming && (
          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              onClick={handlePlayTTS}
              disabled={isPlaying}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 cursor-pointer border border-border/30 disabled:opacity-50"
              title={isPlaying ? "Playing..." : "Read aloud (TTS)"}
            >
              {isPlaying ? (
                <>
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="currentColor">
                    <rect x={6} y={4} width={4} height={16} />
                    <rect x={14} y={4} width={4} height={16} />
                  </svg>
                  Playing...
                </>
              ) : (
                <>
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  Listen
                </>
              )}
            </button>
            {audioError && <span className="text-[10px] text-destructive">{audioError}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

  /* ── SessionItem ─────────────────────────────────────────────── */
function SessionItem({ session, isActive, onClick, onDelete, onUnfile, draggable, onDragStart, onDragOver, onDrop, onDragEnd, isDropTarget, isInFolder }) {
  const [mouseDownPos, setMouseDownPos] = useState(null);

  const handleMouseDown = useCallback((e) => {
    setMouseDownPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseUp = useCallback((e) => {
    if (!mouseDownPos || !onClick) return;
    const dx = Math.abs(e.clientX - mouseDownPos.x);
    const dy = Math.abs(e.clientY - mouseDownPos.y);
    setMouseDownPos(null);
    if (dx < 5 && dy < 5) {
      onClick();
    }
  }, [mouseDownPos, onClick]);

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      className={cn(
        "px-3 py-2 border-b border-border/20 first:border-t first:border-border/20 transition-colors select-none group relative",
        "hover:bg-accent/40",
        isActive && "bg-accent",
        isDropTarget && "bg-primary/20 ring-1 ring-primary/40",
        draggable && "cursor-grab active:cursor-grabbing",
        isInFolder && "pl-5"
      )}
    >
      <div className="font-medium text-sm truncate leading-tight pr-14">{session.title || session.preview || "Untitled chat"}</div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[11px] text-muted-foreground">{timeAgo(session.last_active || session.started_at)}</span>
        {session.message_count > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{session.message_count}</Badge>}
        {!session.ended_at && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" title="Active" />}
      </div>
      {onUnfile && (
        <button
          onClick={(e) => { e.stopPropagation(); onUnfile(); }}
          className="absolute top-0 right-7 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded hover:bg-accent/60 text-muted-foreground hover:text-foreground cursor-pointer"
          title="Move out of folder"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
          </svg>
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-0 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive cursor-pointer"
        title="Delete session"
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}

/* ── FolderHeader ──────────────────────────────────────────────── */
function FolderHeader({ folder, onToggle, onRename, onDelete, onDragOver, onDrop, isDropTarget }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const inputRef = useRef(null);

  useEffect(() => { setName(folder.name); }, [folder.name]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (name.trim() && name !== folder.name) onRename(name.trim());
  };

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "flex items-center gap-2 mx-0 px-3 py-2 bg-muted/60 border-b border-border/30 select-none group",
        isDropTarget && "bg-primary/20 ring-1 ring-primary/40"
      )}
    >
      <button onClick={onToggle} className="text-muted-foreground hover:text-foreground cursor-pointer shrink-0">
        {folder.collapsed ? (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        ) : (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        )}
      </button>
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setName(folder.name); } }}
          className="flex-1 h-6 px-1.5 text-xs bg-background border border-border/50 rounded text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          className="flex-1 text-xs font-semibold text-foreground truncate cursor-pointer"
          title="Double-click to rename"
        >
          {folder.name}
        </span>
      )}
      <button
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer p-0.5 rounded"
        title="Rename"
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive cursor-pointer p-0.5 rounded"
        title="Delete folder (sessions become unfiled)"
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}

/* ── Hermes ASCII caduceus ───────────────────────────────────── */
const CADUCEUS_ART = [
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2880\u28c0\u2840\u2800\u28c0\u28c0\u2800\u2880\u28c0\u2840\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2880\u28e0\u28f4\u28fe\u28ff\u28ff\u28c7\u2838\u28ff\u28ff\u2807\u28f8\u28ff\u28ff\u28f7\u28e6\u28c4\u2840\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2880\u28e0\u28f4\u28f6\u283f\u280b\u28e9\u287f\u28ff\u287f\u283b\u28ff\u2847\u28a0\u2844\u28b8\u28ff\u281f\u28bf\u28ff\u28bf\u28cd\u2819\u283f\u28f6\u28e6\u28c4\u2840\u2800",
  "\u2800\u2800\u2809\u2809\u2801\u2836\u281f\u280b\u2800\u2809\u2800\u2880\u28c8\u28c1\u2848\u2881\u28c8\u28c1\u2840\u2800\u2809\u2800\u2819\u283b\u2836\u2808\u2809\u2809\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u28f4\u28ff\u287f\u281b\u2881\u2848\u281b\u28bf\u28ff\u28e6\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u283f\u28ff\u28e6\u28e4\u28c8\u2801\u28a0\u28f4\u28ff\u283f\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2808\u2809\u283b\u28bf\u28ff\u28e6\u2849\u2801\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2818\u28b7\u28e6\u28c8\u281b\u2803\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u28a0\u28f4\u2826\u2808\u2819\u283f\u28e6\u2844\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2838\u28ff\u28e4\u2848\u2801\u28a4\u28ff\u2807\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2809\u281b\u2837\u2804\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2880\u28c0\u2811\u28b6\u28c4\u2840\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u28ff\u2801\u28b0\u2846\u2808\u287f\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2808\u2833\u2808\u28e1\u281e\u2801\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
  "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2808\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800",
];

/* ── WebUIChat (main component) ──────────────────────────────── */
function WebUIChat() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(() => {
    try { return localStorage.getItem("hermes-chat-active-session") || null; } catch { return null; }
  });
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState(null);
  const [messageQueue, setMessageQueue] = useState([]);
  const abortControllerRef = useRef(null);
  const currentRequestIdRef = useRef(null);
  const streamingContentRef = useRef("");
  const isLoadingRef = useRef(false);
  const activeSessionIdRef = useRef(null);
  const currentStreamSessionIdRef = useRef(null);
  const [fontSize, setFontSize] = useState(() => {
    try { return parseInt(localStorage.getItem("hermes-chat-font-size"), 10) || 14; } catch { return 14; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem("hermes-chat-sidebar") !== "false"; } catch { return true; }
  });
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    try { return localStorage.getItem("hermes-chat-selected-model") || ""; } catch { return ""; }
  });
  const [currentPage, setCurrentPage] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const PAGE_SIZE = 1000;
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  /* Approval state for dangerous-command prompts */
  const [approvalRequest, setApprovalRequest] = useState(null);
  /* YOLO mode indicator */
  const [yoloEnabled, setYoloEnabled] = useState(false);

  /* Folder state */
  const [folderState, setFolderState] = useState(loadFolderState);
  const [draggingId, setDraggingId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState(null);

  /* Persist folder state */
  useEffect(() => {
    saveFolderState(folderState);
  }, [folderState]);

  /* Models */
  useEffect(() => {
    fetch("/api/plugins/webui/models")
      .then((r) => r.json())
      .then((data) => {
        const modelList = (data.models || []).filter(Boolean);
        setAvailableModels(modelList);
        const current = data.current_model || modelList[0] || "";
        if (!selectedModel && current) setSelectedModel(current);
        else if (selectedModel && !modelList.includes(selectedModel)) setSelectedModel(current);
      })
      .catch((err) => console.error("Failed to load models:", err));
  }, []);

  useEffect(() => {
    try { if (selectedModel) localStorage.setItem("hermes-chat-selected-model", selectedModel); } catch {}
  }, [selectedModel]);

  /* Resume from URL */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resume");
    if (resumeId) {
      setActiveSessionId(resumeId);
      const url = new URL(window.location.href);
      url.searchParams.delete("resume");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  /* Sessions */
  const refreshSessions = useCallback((page) => {
    const p = page !== undefined ? page : currentPage;
    api.getSessions(PAGE_SIZE, p * PAGE_SIZE)
      .then((data) => {
        setSessions(data.sessions || []);
        setTotalSessions(data.total || 0);
      })
      .catch((err) => console.error("Failed to load sessions:", err));
  }, [currentPage]);

  useEffect(() => { refreshSessions(); }, [refreshSessions]);

  /* Messages */
  useEffect(() => {
    if (!activeSessionId) { setMessages([]); return; }
    setError(null);
    api.getSessionMessages(activeSessionId)
      .then((data) => {
        const allMsgs = data.messages || [];
        const displayMsgs = [];
        let lastAssistantIdx = -1;
        for (const m of allMsgs) {
          if (m.role === "user") {
            displayMsgs.push({ role: m.role, content: typeof m.content === "string" ? m.content : "", images: [] });
            continue;
          }
          if (m.role === "assistant") {
            const content = typeof m.content === "string" ? m.content : "";
            if (content.trim().length > 0) {
              displayMsgs.push({ role: m.role, content, images: [] });
              lastAssistantIdx = displayMsgs.length - 1;
            }
            continue;
          }
          if (m.role === "tool" && lastAssistantIdx >= 0) {
            try {
              const toolResult = JSON.parse(typeof m.content === "string" ? m.content : "");
              const urls = [];
              if (toolResult.image_url) urls.push(toolResult.image_url);
              if (toolResult.url) urls.push(toolResult.url);
              if (toolResult.images && Array.isArray(toolResult.images)) urls.push(...toolResult.images);
              if (urls.length > 0) {
                const target = displayMsgs[lastAssistantIdx];
                if (target) {
                  target.images = target.images || [];
                  for (const u of urls) if (!target.images.includes(u)) target.images.push(u);
                }
              }
            } catch {}
          }
        }
        for (const m of displayMsgs) {
          if (m.role !== "assistant" || !m.content) continue;
          const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
          let match;
          while ((match = imgRegex.exec(m.content)) !== null) {
            m.images = m.images || [];
            if (!m.images.includes(match[2])) m.images.push(match[2]);
          }
        }
        setMessages(displayMsgs);
      })
      .catch((err) => { console.error("Failed to load messages:", err); setError("Could not load session messages."); });
  }, [activeSessionId]);

  /* Auto-scroll */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streamingContent]);

  /* Keep refs in sync with state for instant reads from callbacks */
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { streamingContentRef.current = streamingContent; }, [streamingContent]);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);

  /* Persist active session so it survives browser refresh */
  useEffect(() => {
    try {
      if (activeSessionId) {
        localStorage.setItem("hermes-chat-active-session", activeSessionId);
      }
    } catch {}
  }, [activeSessionId]);

  /* Focus input */
  useEffect(() => { inputRef.current?.focus(); }, [activeSessionId]);

  /* Persist settings */
  useEffect(() => { try { localStorage.setItem("hermes-chat-font-size", String(fontSize)); } catch {} }, [fontSize]);
  useEffect(() => { try { localStorage.setItem("hermes-chat-sidebar", String(sidebarOpen)); } catch {} }, [sidebarOpen]);

  /* Actions */
  const handleNewChat = useCallback(() => {
    /* Abort any cross-session stream before clearing state */
    if (isLoadingRef.current && currentStreamSessionIdRef.current && currentStreamSessionIdRef.current !== activeSessionIdRef.current) {
      abortControllerRef.current?.abort();
    }
    setActiveSessionId(null); setMessages([]); setInputValue(""); setStreamingContent(""); setError(null); setCurrentPage(0);
    try { localStorage.removeItem("hermes-chat-active-session"); } catch {}
  }, []);

  const handleSelectSession = useCallback((id) => {
    /* If there's an active stream for a different session, abort it so it
       doesn't leak updates into the new session we're switching to. */
    if (isLoadingRef.current && currentStreamSessionIdRef.current && currentStreamSessionIdRef.current !== id) {
      abortControllerRef.current?.abort();
      // Do NOT append partials here - they belong to the old session and
      // would pollute the new one. The backend has already persisted messages.
    }
    setActiveSessionId(id); setStreamingContent(""); setError(null);
  }, []);

  const handleDeleteSession = useCallback((id) => {
    api.deleteSession(id).then(() => {
      if (id === activeSessionId) handleNewChat();
      if (sessions.length === 1 && currentPage > 0) setCurrentPage((p) => p - 1);
      else refreshSessions();
      // Also remove from folder assignments
      setFolderState((fs) => {
        const next = { ...fs, assignments: { ...fs.assignments } };
        delete next.assignments[id];
        return next;
      });
    }).catch((err) => { console.error("Failed to delete session:", err); setError("Could not delete session."); });
  }, [activeSessionId, handleNewChat, refreshSessions, sessions.length, currentPage]);

  const handleSend = useCallback(async (explicitText) => {
    const text = (explicitText !== undefined ? explicitText : inputValue).trim();
    if (!text) return;

    /* If a turn is already running, queue this message for auto-send */
    if (isLoadingRef.current && explicitText === undefined) {
      setMessageQueue((prev) => [...prev, text]);
      setInputValue("");
      return;
    }

    /* Slash-command routing: /yolo, /clear, /new, /help */
    if (text.startsWith("/") && !text.startsWith("//")) {
      const cmd = text.slice(1).split(/\s+/)[0].toLowerCase();
      const knownCommands = ["yolo", "clear", "cls", "new", "reset", "help"];
      if (knownCommands.includes(cmd)) {
        setInputValue("");
        setError(null);
        try {
          const res = await fetch("/api/plugins/webui/command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: activeSessionId, command: text }),
          });
          const data = await res.json();
          if (data.type === "yolo_toggle") {
            setYoloEnabled(data.enabled);
            setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
          } else if (data.type === "clear") {
            setMessages([]);
          } else if (data.type === "new_session") {
            handleNewChat();
          } else if (data.type === "help") {
            const helpText = data.commands.map((c) => `**${c.name}** \u2014 ${c.description}`).join("\n");
            setMessages((prev) => [...prev, { role: "assistant", content: `## Available Commands\n\n${helpText}` }]);
          } else if (data.type === "error") {
            setError(data.message);
          }
        } catch (err) {
          setError("Command failed: " + err.message);
        }
        return;
      }
    }

    setInputValue("");
    setIsLoading(true);
    setStreamingContent("");
    streamingContentRef.current = "";
    setError(null);
    setApprovalRequest(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    const requestId = "req_" + Math.random().toString(36).slice(2, 11);
    currentRequestIdRef.current = requestId;
    const startedSessionId = activeSessionId;
    currentStreamSessionIdRef.current = startedSessionId;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch("/api/plugins/webui/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          session_id: activeSessionId,
          message: text,
          model: selectedModel || undefined,
          request_id: requestId,
        }),
      });
      if (!res.ok) { const body = await res.text().catch(() => res.statusText); throw new Error(`${res.status}: ${body}`); }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentSessionId = activeSessionId;
      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const msg = JSON.parse(payload);
            if (msg.type === "delta") {
              /* Only show deltas if we're still viewing the session that
                 started this stream; otherwise silently drop them. */
              if (startedSessionId !== activeSessionIdRef.current) continue;
              const delta = msg.content || "";
              setStreamingContent((prev) => prev + delta);
              streamingContentRef.current += delta;
            } else if (msg.type === "approval") {
              /* Dangerous command approval request from backend */
              if (startedSessionId === activeSessionIdRef.current) {
                setApprovalRequest({
                  requestId: msg.request_id,
                  command: msg.command,
                  description: msg.description,
                  choices: msg.choices || ["once", "session", "deny"],
                });
              }
            } else if (msg.type === "done") {
              currentSessionId = msg.session_id;
              const resultText = msg.result || "";
              const mdImages = []; const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g; let match;
              while ((match = imgRegex.exec(resultText)) !== null) { if (!mdImages.includes(match[2])) mdImages.push(match[2]); }
              const allImages = [...(msg.images || [])];
              for (const u of mdImages) if (!allImages.includes(u)) allImages.push(u);
              /* Only update messages UI if still on the originating session */
              if (startedSessionId === activeSessionIdRef.current) {
                setMessages((prev) => [...prev, { role: "assistant", content: resultText, images: allImages }]);
              }
              setStreamingContent(""); streamingContentRef.current = "";
              setIsLoading(false); currentStreamSessionIdRef.current = null; streamDone = true; refreshSessions();
            } else if (msg.type === "error") {
              if (startedSessionId === activeSessionIdRef.current) {
                setMessages((prev) => [...prev, { role: "assistant", content: "Error: " + (msg.message || "Unknown error") }]);
              }
              setStreamingContent(""); streamingContentRef.current = "";
              setIsLoading(false); currentStreamSessionIdRef.current = null; streamDone = true;
            }
          } catch {}
        }
      }
      if (currentSessionId && currentSessionId !== activeSessionId && startedSessionId === activeSessionIdRef.current) {
        setActiveSessionId(currentSessionId);
      }
      /* If the stream closed without an explicit done/error, tidy up */
      if (!streamDone) {
        setIsLoading(false);
        currentStreamSessionIdRef.current = null;
      }
    } catch (err) {
      if (err.name === "AbortError") {
        // Stop was handled by handleStop; don't overwrite state
        return;
      }
      console.error(err);
      if (startedSessionId === activeSessionIdRef.current) {
        setMessages((prev) => [...prev, { role: "assistant", content: "Error: " + err.message }]);
      }
      setStreamingContent(""); streamingContentRef.current = "";
      setIsLoading(false);
      currentStreamSessionIdRef.current = null;
    }
  }, [inputValue, activeSessionId, selectedModel, refreshSessions]);

  const handleStop = useCallback(() => {
    const partial = streamingContentRef.current;
    /* Only append partial to the current session's messages if the stream
       we're stopping actually belongs to this session. */
    if (partial && currentStreamSessionIdRef.current === activeSessionIdRef.current) {
      setMessages((prev) => [...prev, { role: "assistant", content: partial }]);
    }
    setStreamingContent("");
    streamingContentRef.current = "";
    setIsLoading(false);
    currentStreamSessionIdRef.current = null;
    setApprovalRequest(null);
    abortControllerRef.current?.abort();

    // Tell the backend to interrupt the agent loop (fire-and-forget)
    const requestId = currentRequestIdRef.current;
    if (requestId) {
      fetch("/api/plugins/webui/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
      }).catch(() => {});
    }
  }, []);

  /* Send approval choice for a dangerous-command prompt */
  const sendApprovalChoice = useCallback(async (requestId, choice) => {
    try {
      await fetch("/api/plugins/webui/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, choice }),
      });
      setApprovalRequest(null);
    } catch (err) {
      console.error("Approval failed:", err);
    }
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  /* Auto-dequeue: when a turn finishes, fire the next queued message */
  useEffect(() => {
    if (!isLoading && messageQueue.length > 0) {
      const [next, ...rest] = messageQueue;
      setMessageQueue(rest);
      // Defer to next tick so state flush doesn't collide
      setTimeout(() => handleSend(next), 0);
    }
  }, [isLoading, messageQueue, handleSend]);

  const hasContent = messages.length > 0 || streamingContent;

  /* ── Folder actions ─────────────────────────────────────────── */
  const createFolder = useCallback(() => {
    const id = genId();
    setFolderState((fs) => ({
      ...fs,
      folders: [...fs.folders, { id, name: "New Folder", collapsed: false }],
    }));
  }, []);

  const toggleFolder = useCallback((folderId) => {
    setFolderState((fs) => ({
      ...fs,
      folders: fs.folders.map((f) => f.id === folderId ? { ...f, collapsed: !f.collapsed } : f),
    }));
  }, []);

  const renameFolder = useCallback((folderId, name) => {
    setFolderState((fs) => ({
      ...fs,
      folders: fs.folders.map((f) => f.id === folderId ? { ...f, name } : f),
    }));
  }, []);

  const deleteFolder = useCallback((folderId) => {
    setFolderState((fs) => {
      const nextAssignments = { ...fs.assignments };
      for (const [sid, fid] of Object.entries(nextAssignments)) {
        if (fid === folderId) delete nextAssignments[sid];
      }
      return {
        folders: fs.folders.filter((f) => f.id !== folderId),
        assignments: nextAssignments,
      };
    });
  }, []);

  const moveSessionToFolder = useCallback((sessionId, folderId) => {
    setFolderState((fs) => ({
      ...fs,
      assignments: { ...fs.assignments, [sessionId]: folderId },
    }));
  }, []);

  const unfileSession = useCallback((sessionId) => {
    setFolderState((fs) => {
      const next = { ...fs, assignments: { ...fs.assignments } };
      delete next.assignments[sessionId];
      return next;
    });
  }, []);

  /* ── Drag handlers ──────────────────────────────────────────── */
  const handleDragStart = (sessionId) => (e) => {
    setDraggingId(sessionId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", sessionId);
  };

  const handleDragOverSession = (sessionId) => (e) => {
    e.preventDefault();
    if (draggingId && draggingId !== sessionId) setDropTargetId(sessionId);
  };

  const handleDragOverFolder = (folderId) => (e) => {
    e.preventDefault();
    if (draggingId) setDropTargetFolderId(folderId);
  };

  const handleDropOnSession = (targetId) => (e) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain") || draggingId;
    setDropTargetId(null);
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;
    // Only action: if dragged session is in a folder, unfile it
    if (folderState.assignments[sourceId]) {
      unfileSession(sourceId);
    }
  };

  const handleDropOnFolder = (folderId) => (e) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain") || draggingId;
    setDropTargetFolderId(null);
    setDraggingId(null);
    if (!sourceId) return;
    moveSessionToFolder(sourceId, folderId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTargetId(null);
    setDropTargetFolderId(null);
  };

  /* ── Derived session lists ──────────────────────────────────── */
  const sessionMap = Object.fromEntries(sessions.map((s) => [s.id, s]));

  const unfiledSessions = sessions.filter((s) => !folderState.assignments[s.id]);

  /* ── Render sidebar items ───────────────────────────────────── */
  const renderSidebarItems = () => {
    const items = [];

    // Folders section
    for (const folder of folderState.folders) {
      const folderSessions = sessions.filter((s) => folderState.assignments[s.id] === folder.id);
      const isTarget = dropTargetFolderId === folder.id;
      items.push(
        <div key={folder.id} className="mb-3 border border-border/20 rounded-sm overflow-hidden bg-background/30">
          <FolderHeader
            folder={folder}
            onToggle={() => toggleFolder(folder.id)}
            onRename={(name) => renameFolder(folder.id, name)}
            onDelete={() => deleteFolder(folder.id)}
            onDragOver={(e) => handleDragOverFolder(folder.id)(e)}
            onDrop={(e) => handleDropOnFolder(folder.id)(e)}
            isDropTarget={isTarget}
          />
          {!folder.collapsed && (
            <div className="space-y-1">
              {folderSessions.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  isActive={s.id === activeSessionId}
                  onClick={() => handleSelectSession(s.id)}
                  onDelete={() => handleDeleteSession(s.id)}
                  onUnfile={() => unfileSession(s.id)}
                  draggable
                  onDragStart={handleDragStart(s.id)}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={handleDropOnSession(s.id)}
                  onDragEnd={handleDragEnd}
                  isInFolder
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    // Separator between folders and unfiled sessions
    if (folderState.folders.length > 0 && unfiledSessions.length > 0) {
      items.push(
        <div key="__separator__" className="my-2 px-3">
          <div className="h-px bg-border/40" />
        </div>
      );
    }

    // Unfiled sessions
    if (unfiledSessions.length > 0) {
      items.push(
        <div key="__unfiled__" className="space-y-1">
          {unfiledSessions.map((s) => (
            <SessionItem
              key={s.id}
              session={s}
              isActive={s.id === activeSessionId}
              onClick={() => handleSelectSession(s.id)}
              onDelete={() => handleDeleteSession(s.id)}
              draggable
              onDragStart={handleDragStart(s.id)}
              onDragOver={handleDragOverSession(s.id)}
              onDrop={handleDropOnSession(s.id)}
              onDragEnd={handleDragEnd}
              isDropTarget={dropTargetId === s.id}
            />
          ))}
        </div>
      );
    }

    return items;
  };

  /* ── Main render ────────────────────────────────────────────── */
  return (
    <div className="flex flex-row h-full overflow-hidden normal-case">
      {/* Sidebar */}
      <div
        className={cn(
          "flex flex-col h-full ease-out overflow-hidden min-w-0",
          sidebarOpen ? "bg-background/70 backdrop-blur-xl border-r border-border/30 shadow-lg" : "opacity-0"
        )}
        style={{ width: sidebarOpen ? "18rem" : "0px", transition: "width 300ms ease-out, opacity 300ms ease-out" }}
      >
        {/* Sidebar header */}
        <div className="p-3 border-b border-border/40 flex-shrink-0 flex flex-col gap-2 w-full overflow-hidden">
          <div className="flex items-center gap-2">
            <Button onClick={() => setSidebarOpen(false)} size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" title="Collapse sidebar">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x={3} y={3} width={18} height={18} rx={2} />
                <path d="M9 3v18" />
                <path d="m14 9-3 3 3 3" />
              </svg>
            </Button>
            <Button onClick={handleNewChat} className="flex-1" size="sm">+ New Chat</Button>
          </div>
          {availableModels.length > 0 && (
            <div className="flex items-center gap-2">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground flex-shrink-0">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1={12} y1={22.08} x2={12} y2={12} />
              </svg>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="flex-1 h-8 px-2 text-xs bg-background border border-border/50 rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring cursor-pointer normal-case tracking-normal"
                title="Select model for new chats"
              >
                {availableModels.map((m) => <option key={m} value={m} className="bg-background text-foreground">{m}</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">A</span>
            <input
              type="range" min={12} max={22} value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
              className="flex-1 h-1 appearance-none bg-border rounded-full cursor-pointer accent-primary"
            />
            <span className="text-[11px] text-muted-foreground">{fontSize}px</span>
          </div>
          <Button onClick={createFolder} variant="outline" size="sm" className="h-7 text-[11px]">
            + New Folder
          </Button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto min-h-0 w-full overflow-hidden">
          {sessions.length === 0 && <div className="p-4 text-xs text-muted-foreground text-center">No sessions yet</div>}
          {renderSidebarItems()}
        </div>

        {/* Pagination footer */}
        {totalSessions > PAGE_SIZE && (
          <div className="flex-shrink-0 border-t border-border/40 px-2 py-1.5 flex items-center justify-between w-full overflow-hidden">
            <button
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className={cn(
                "text-[11px] px-2 py-0.5 rounded transition-colors cursor-pointer",
                currentPage === 0 ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              )}
            >
              ← Prev
            </button>
            <span className="text-[10px] text-muted-foreground tabular-nums select-none">{currentPage + 1} / {Math.ceil(totalSessions / PAGE_SIZE)}</span>
            <button
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={(currentPage + 1) * PAGE_SIZE >= totalSessions}
              className={cn(
                "text-[11px] px-2 py-0.5 rounded transition-colors cursor-pointer",
                (currentPage + 1) * PAGE_SIZE >= totalSessions ? "text-muted-foreground/40 cursor-not-allowed" : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
              )}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 h-full relative">
        {/* Floating toggle button when sidebar collapsed */}
        {!sidebarOpen && (
          <div className="absolute top-2 left-2 z-10">
            <Button onClick={() => setSidebarOpen(true)} size="icon" variant="ghost" className="h-8 w-8 bg-background/60 backdrop-blur-sm hover:bg-background/80 shadow-sm border border-border/30" title="Open sidebar">
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1={3} y1={12} x2={21} y2={12} />
                <line x1={3} y1={6} x2={21} y2={6} />
                <line x1={3} y1={18} x2={21} y2={18} />
              </svg>
            </Button>
          </div>
        )}

        {/* YOLO toggle — top-right, muted until hovered */}
        <div className="absolute top-2 right-2 z-10 opacity-30 hover:opacity-100 transition-opacity duration-200">
          <Button
            onClick={() => handleSend("/yolo")}
            size="icon"
            variant="ghost"
            className={cn(
              "h-7 w-7 backdrop-blur-sm shadow-sm border",
              yoloEnabled
                ? "bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30 hover:text-amber-300"
                : "bg-background/40 border-border/20 text-muted-foreground hover:bg-background/80 hover:text-foreground"
            )}
            title={yoloEnabled ? "YOLO mode ON — click to disable" : "YOLO mode OFF — click to enable"}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </Button>
        </div>

        {/* Content area */}
        {!hasContent ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto">
            <div className="flex flex-col items-center mb-6 select-none" style={{ fontFamily: "monospace", lineHeight: 1.15 }}>
              {CADUCEUS_ART.map((line, i) => (
                <div key={i} className={cn("text-xs md:text-sm whitespace-pre", i < 4 ? "text-amber-400" : i < 8 ? "text-yellow-500" : i < 12 ? "text-amber-600" : "text-yellow-700")}>{line}</div>
              ))}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-1">Nous Hermes</h1>
            <p className="text-sm text-muted-foreground">Messenger of the Digital Gods</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 md:px-6">
            {error && <div className="p-3 mb-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">{error}</div>}
            {messages.map((msg, idx) => <ChatBubble key={idx} role={msg.role} content={msg.content} fontSize={fontSize} images={msg.images} />)}
            {streamingContent && <ChatBubble role="assistant" content={streamingContent} isStreaming fontSize={fontSize} images={[]} />}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input bar */}
        <div className="flex-shrink-0 border-t border-border p-3 md:p-4">
          {/* Approval prompt overlay */}
          {approvalRequest && (
            <div className="mb-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10">
              <div className="text-xs font-semibold text-amber-400 mb-1">⚠️ Dangerous Command Approval</div>
              <div className="text-xs text-muted-foreground mb-1">{approvalRequest.description}</div>
              <pre className="text-[11px] bg-background/60 rounded p-2 mb-2 overflow-x-auto border border-border/30" style={{ fontSize: `${fontSize - 2}px` }}>
                <code>{approvalRequest.command}</code>
              </pre>
              <div className="flex flex-wrap gap-2">
                {approvalRequest.choices.includes("once") && (
                  <Button onClick={() => sendApprovalChoice(approvalRequest.requestId, "once")} size="sm" className="h-7 text-[11px] bg-amber-500 hover:bg-amber-600 text-white">
                    Approve Once
                  </Button>
                )}
                {approvalRequest.choices.includes("session") && (
                  <Button onClick={() => sendApprovalChoice(approvalRequest.requestId, "session")} size="sm" variant="outline" className="h-7 text-[11px]">
                    Approve Session
                  </Button>
                )}
                {approvalRequest.choices.includes("always") && (
                  <Button onClick={() => sendApprovalChoice(approvalRequest.requestId, "always")} size="sm" variant="outline" className="h-7 text-[11px]">
                    Approve Always
                  </Button>
                )}
                <Button onClick={() => sendApprovalChoice(approvalRequest.requestId, "deny")} size="sm" variant="outline" className="h-7 text-[11px] text-destructive hover:text-destructive hover:bg-destructive/10">
                  Deny
                </Button>
              </div>
            </div>
          )}
          {/* YOLO mode indicator */}
          {yoloEnabled && (
            <div className="mb-2 text-[10px] text-amber-400 font-medium text-center">
              ⚡ YOLO MODE ON — Commands auto-approved
            </div>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px"; }}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? "Hermes is thinking..." : "Message Hermes..."}
              rows={1}
              className="flex-1 min-h-[44px] max-h-[200px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              style={fontSize ? { fontSize: `${fontSize}px`, lineHeight: 1.5 } : { lineHeight: 1.5 }}
            />
            <Button onClick={isLoading ? handleStop : handleSend} disabled={!isLoading && !inputValue.trim()} size="default">
              {isLoading ? (
                <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
                  <rect x={6} y={6} width={12} height={12} rx={2} />
                </svg>
              ) : (
                "Send"
              )}
            </Button>
          </div>
          {messageQueue.length > 0 && (
            <div className="text-[10px] text-muted-foreground text-center mt-1">
              {messageQueue.length} message{messageQueue.length > 1 ? "s" : ""} queued
            </div>
          )}
          {activeSessionId && <div className="text-[10px] text-muted-foreground text-center mt-1">Session: {activeSessionId.slice(0, 20)}…</div>}
          {selectedModel && <div className="text-[10px] text-muted-foreground text-center mt-0.5">Model: {selectedModel}</div>}
        </div>
      </div>
    </div>
  );
}

/* Register */
window.__HERMES_PLUGINS__.register("webui", WebUIChat);
