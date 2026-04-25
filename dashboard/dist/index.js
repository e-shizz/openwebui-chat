(function () {
  "use strict";

  const { React, hooks, components, utils, api } = window.__HERMES_PLUGIN_SDK__;
  const { useState, useEffect, useRef, useCallback } = hooks;
  const { Card, CardContent, Button, Input, Badge, Separator } = components;
  const { cn, timeAgo } = utils;

  /* ── Load highlight.js for syntax highlighting ───────────────── */
  if (!window.hljs) {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js";
    script.async = true;
    document.head.appendChild(script);
  }

  /* ── CodeBlock with hover copy button + syntax highlighting ───── */
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

    return React.createElement(
      "div",
      {
        className:
          "group relative bg-muted/80 bg-black/20 rounded-lg p-3 my-2 font-mono text-xs text-foreground overflow-x-auto border border-border/30",
      },
      React.createElement(
        "button",
        {
          onClick: handleCopy,
          className:
            "absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out flex items-center gap-1.5 px-2 py-1 rounded bg-background/80 hover:bg-background text-foreground text-[10px] border border-border/40 cursor-pointer z-10",
          title: "Copy to clipboard",
        },
        copied
          ? React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "svg",
                { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
                React.createElement("polyline", { points: "20 6 9 17 4 12" })
              ),
              "Copied!"
            )
          : React.createElement(
              React.Fragment,
              null,
              React.createElement(
                "svg",
                { width: 12, height: 12, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
                React.createElement("rect", { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }),
                React.createElement("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })
              ),
              "Copy"
            )
      ),
      lang &&
        React.createElement(
          "div",
          { className: "text-[10px] text-muted-foreground mb-1 select-none" },
          lang
        ),
      React.createElement(
        "pre",
        { className: "whitespace-pre-wrap break-words m-0 hljs", style: codeStyle, ref: preRef }
      )
    );
  }

  /* ── ChatBubble ─────────────────────────────────────────────── */
  function ChatBubble({ role, content, isStreaming, fontSize }) {
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
      return React.createElement(
        "div",
        { className: "flex w-full mb-3 justify-end" },
        React.createElement(
          "div",
          {
            className:
              "max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm bg-muted text-foreground border border-border/50",
          },
          React.createElement(
            "div",
            { className: "whitespace-pre-wrap break-words", style: textStyle },
            content
          ),
          isStreaming &&
            React.createElement("span", {
              className:
                "inline-block w-1.5 h-4 ml-1 bg-current align-middle animate-pulse rounded-sm",
            })
        )
      );
    }

    function parseSegments(text) {
      if (!text) return [{ type: "text", content: "" }];
      const segments = [];
      const regex = /```(\w*)\n?([\s\S]*?)```/g;
      let lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
        }
        segments.push({ type: "code", lang: match[1], content: match[2] });
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < text.length) {
        segments.push({ type: "text", content: text.slice(lastIndex) });
      }
      return segments.length ? segments : [{ type: "text", content: text }];
    }

    const segments = parseSegments(content);
    const children = segments.map((seg, i) =>
      seg.type === "text"
        ? React.createElement(
            "div",
            { key: i, className: "whitespace-pre-wrap break-words text-foreground py-1", style: textStyle },
            seg.content
          )
        : React.createElement(CodeBlock, { key: i, code: seg.content, lang: seg.lang, fontSize })
    );

    if (isStreaming) {
      children.push(
        React.createElement("span", {
          key: "stream",
          className:
            "inline-block w-1.5 h-4 ml-1 bg-current align-middle animate-pulse rounded-sm",
        })
      );
    }

    return React.createElement(
      "div",
      { className: "flex w-full mb-3 justify-start group" },
      React.createElement(
        "div",
        { className: "max-w-[85%] text-sm leading-relaxed" },
        children,
        /* Action row: TTS play button */
        !isStreaming &&
          React.createElement(
            "div",
            { className: "flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150" },
            React.createElement(
              "button",
              {
                onClick: handlePlayTTS,
                disabled: isPlaying,
                className: "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/50 cursor-pointer border border-border/30 disabled:opacity-50",
                title: isPlaying ? "Playing..." : "Read aloud (TTS)",
              },
              isPlaying
                ? React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(
                      "svg",
                      { width: 10, height: 10, viewBox: "0 0 24 24", fill: "currentColor" },
                      React.createElement("rect", { x: 6, y: 4, width: 4, height: 16 }),
                      React.createElement("rect", { x: 14, y: 4, width: 4, height: 16 })
                    ),
                    "Playing..."
                  )
                : React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(
                      "svg",
                      { width: 10, height: 10, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
                      React.createElement("polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }),
                      React.createElement("path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" })
                    ),
                    "Listen"
                  )
            ),
            audioError &&
              React.createElement("span", { className: "text-[10px] text-destructive" }, audioError)
          )
      )
    );
  }

  /* ── SessionItem ─────────────────────────────────────────────── */
  function SessionItem({ session, isActive, onClick, onDelete }) {
    return React.createElement(
      "div",
      {
        onClick: onClick,
        className: cn(
          "cursor-pointer px-3 py-2.5 border-b border-border/40 transition-colors select-none group relative",
          "hover:bg-accent/60",
          isActive && "bg-accent"
        ),
      },
      React.createElement(
        "div",
        { className: "font-medium text-sm truncate leading-tight pr-6" },
        session.title || session.preview || "Untitled chat"
      ),
      React.createElement(
        "div",
        { className: "flex items-center gap-2 mt-1" },
        React.createElement(
          "span",
          { className: "text-[11px] text-muted-foreground" },
          timeAgo(session.last_active || session.started_at)
        ),
        session.message_count > 0 &&
          React.createElement(
            Badge,
            { variant: "secondary", className: "text-[10px] h-4 px-1.5" },
            session.message_count
          ),
        !session.ended_at &&
          React.createElement("span", {
            className: "w-1.5 h-1.5 rounded-full bg-green-500 inline-block",
            title: "Active",
          })
      ),
      React.createElement(
        "button",
        {
          onClick: (e) => { e.stopPropagation(); onDelete(); },
          className: "absolute top-0 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive cursor-pointer",
          title: "Delete session",
        },
        React.createElement(
          "svg",
          { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
          React.createElement("polyline", { points: "3 6 5 6 21 6" }),
          React.createElement("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })
        )
      )
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
    "\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2808\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800\u2800"
  ];

  /* ── WebUIChat (main component) ──────────────────────────────── */
  function WebUIChat() {
    const [sessions, setSessions] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [error, setError] = useState(null);
    const [fontSize, setFontSize] = useState(() => {
      try {
        const saved = localStorage.getItem("hermes-chat-font-size");
        return saved ? parseInt(saved, 10) : 14;
      } catch {
        return 14;
      }
    });
    const [sidebarOpen, setSidebarOpen] = useState(() => {
      try {
        const saved = localStorage.getItem("hermes-chat-sidebar");
        return saved !== "false";
      } catch {
        return true;
      }
    });
    const [availableModels, setAvailableModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState(() => {
      try {
        return localStorage.getItem("hermes-chat-selected-model") || "";
      } catch {
        return "";
      }
    });
    const [modelInfo, setModelInfo] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    /* Fetch available models from config + model info */
    useEffect(() => {
      Promise.all([
        api.getConfig().catch(() => null),
        api.getModelInfo().catch(() => null),
      ]).then(([cfg, info]) => {
        setModelInfo(info);
        const models = new Set();
        // Add current model from config
        if (cfg && cfg.model) {
          if (typeof cfg.model === "string") {
            models.add(cfg.model);
          } else if (cfg.model && typeof cfg.model === "object") {
            if (cfg.model.default) models.add(cfg.model.default);
            if (cfg.model.name) models.add(cfg.model.name);
          }
        }
        // Add model from modelInfo
        if (info && info.model) {
          models.add(info.model);
        }
        // Add any explicit models list from config
        if (cfg && Array.isArray(cfg.models)) {
          cfg.models.forEach((m) => {
            if (typeof m === "string") models.add(m);
            else if (m && typeof m === "object" && m.name) models.add(m.name);
          });
        }
        const modelList = Array.from(models).filter(Boolean);
        setAvailableModels(modelList);
        // If no model is selected, default to the first available
        if (!selectedModel && modelList.length > 0) {
          setSelectedModel(modelList[0]);
        }
      });
    }, []);

    /* Persist selected model */
    useEffect(() => {
      try {
        if (selectedModel) {
          localStorage.setItem("hermes-chat-selected-model", selectedModel);
        }
      } catch {}
    }, [selectedModel]);

    /* Handle ?resume=<session_id> from URL */
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

    /* Load session list */
    const refreshSessions = useCallback(() => {
      api
        .getSessions(50, 0)
        .then((data) => setSessions(data.sessions || []))
        .catch((err) => console.error("Failed to load sessions:", err));
    }, []);

    useEffect(() => {
      refreshSessions();
    }, [refreshSessions]);

    /* Load messages when active session changes */
    useEffect(() => {
      if (!activeSessionId) {
        setMessages([]);
        return;
      }
      setError(null);
      api
        .getSessionMessages(activeSessionId)
        .then((data) => {
          const filtered = (data.messages || [])
            .filter((m) => {
              if (m.role === "user") return true;
              if (m.role === "assistant") {
                const hasContent = typeof m.content === "string" && m.content.trim().length > 0;
                return hasContent;
              }
              return false;
            })
            .map((m) => ({
              role: m.role,
              content: typeof m.content === "string" ? m.content : "",
            }));
          setMessages(filtered);
        })
        .catch((err) => {
          console.error("Failed to load messages:", err);
          setError("Could not load session messages.");
        });
    }, [activeSessionId]);

    /* Auto-scroll */
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, streamingContent]);

    /* Focus input on mount / when chat cleared */
    useEffect(() => {
      inputRef.current?.focus();
    }, [activeSessionId]);

    /* Persist font size */
    useEffect(() => {
      try {
        localStorage.setItem("hermes-chat-font-size", String(fontSize));
      } catch {}
    }, [fontSize]);

    /* Persist sidebar state */
    useEffect(() => {
      try {
        localStorage.setItem("hermes-chat-sidebar", String(sidebarOpen));
      } catch {}
    }, [sidebarOpen]);

    const handleNewChat = useCallback(() => {
      setActiveSessionId(null);
      setMessages([]);
      setInputValue("");
      setStreamingContent("");
      setError(null);
    }, []);

    const handleSelectSession = useCallback((id) => {
      setActiveSessionId(id);
      setStreamingContent("");
      setError(null);
    }, []);

    const handleDeleteSession = useCallback((id) => {
      api
        .deleteSession(id)
        .then(() => {
          if (id === activeSessionId) {
            handleNewChat();
          }
          refreshSessions();
        })
        .catch((err) => {
          console.error("Failed to delete session:", err);
          setError("Could not delete session.");
        });
    }, [activeSessionId, handleNewChat, refreshSessions]);

    const handleSend = useCallback(async () => {
      const text = inputValue.trim();
      if (!text || isLoading) return;

      setInputValue("");
      setIsLoading(true);
      setStreamingContent("");
      setError(null);
      setMessages((prev) => [...prev, { role: "user", content: text }]);

      try {
        const res = await fetch("/api/plugins/webui/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: activeSessionId,
            message: text,
            model: selectedModel || undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => res.statusText);
          throw new Error(`${res.status}: ${body}`);
        }

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
                setStreamingContent((prev) => prev + (msg.content || ""));
              } else if (msg.type === "done") {
                currentSessionId = msg.session_id;
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: msg.result || "" },
                ]);
                setStreamingContent("");
                setIsLoading(false);
                streamDone = true;
                refreshSessions();
              } else if (msg.type === "error") {
                setMessages((prev) => [
                  ...prev,
                  { role: "assistant", content: "Error: " + (msg.message || "Unknown error") },
                ]);
                setStreamingContent("");
                setIsLoading(false);
                streamDone = true;
              }
            } catch (_) {}
          }
        }

        if (currentSessionId && currentSessionId !== activeSessionId) {
          setActiveSessionId(currentSessionId);
        }
      } catch (err) {
        console.error(err);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Error: " + err.message },
        ]);
        setIsLoading(false);
      }
    }, [inputValue, isLoading, activeSessionId, selectedModel, refreshSessions]);

    const handleKeyDown = useCallback(
      (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      },
      [handleSend]
    );

    const hasContent = messages.length > 0 || streamingContent;

    /* ── Render ──────────────────────────────────────────────── */
    return React.createElement(
      "div",
      { className: "flex flex-row h-full overflow-hidden normal-case" },

      /* Sidebar */
      React.createElement(
        "div",
        {
          className: cn(
            "flex flex-col h-full ease-out overflow-hidden min-w-0",
            sidebarOpen
              ? "bg-background/70 backdrop-blur-xl border-r border-border/30 shadow-lg"
              : "opacity-0"
          ),
          style: {
            width: sidebarOpen ? "18rem" : "0px",
            transition: "width 300ms ease-out, opacity 300ms ease-out",
          },
        },
        /* Sidebar header */
        React.createElement(
          "div",
          { className: "p-3 border-b border-border/40 flex-shrink-0 flex flex-col gap-2 w-full overflow-hidden" },
          /* Row: toggle + new chat */
          React.createElement(
            "div",
            { className: "flex items-center gap-2" },
            React.createElement(
              Button,
              {
                onClick: () => setSidebarOpen(false),
                size: "icon",
                variant: "ghost",
                className: "h-8 w-8 flex-shrink-0",
                title: "Collapse sidebar",
              },
              React.createElement(
                "svg",
                { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement("rect", { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
                React.createElement("path", { d: "M9 3v18" }),
                React.createElement("path", { d: "m14 9-3 3 3 3" })
              )
            ),
            React.createElement(
              Button,
              { onClick: handleNewChat, className: "flex-1", size: "sm" },
              "+ New Chat"
            )
          ),
          /* Row: model selector */
          availableModels.length > 0 &&
            React.createElement(
              "div",
              { className: "flex items-center gap-2" },
              React.createElement(
                "svg",
                { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", className: "text-muted-foreground flex-shrink-0" },
                React.createElement("path", { d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" }),
                React.createElement("polyline", { points: "3.27 6.96 12 12.01 20.73 6.96" }),
                React.createElement("line", { x1: 12, y1: 22.08, x2: 12, y2: 12 })
              ),
              React.createElement(
                "select",
                {
                  value: selectedModel,
                  onChange: (e) => setSelectedModel(e.target.value),
                  className: "flex-1 h-8 px-2 text-xs bg-background border border-border/50 rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring cursor-pointer normal-case tracking-normal",
                  title: "Select model for new chats",
                },
                availableModels.map((m) =>
                  React.createElement("option", { key: m, value: m, className: "bg-background text-foreground" }, m)
                )
              )
            ),
          /* Row: font size slider */
          React.createElement(
            "div",
            { className: "flex items-center gap-2" },
            React.createElement("span", { className: "text-[10px] text-muted-foreground" }, "A"),
            React.createElement("input", {
              type: "range",
              min: 12,
              max: 22,
              value: fontSize,
              onChange: (e) => setFontSize(parseInt(e.target.value, 10)),
              className: "flex-1 h-1 appearance-none bg-border rounded-full cursor-pointer accent-primary",
            }),
            React.createElement("span", { className: "text-[11px] text-muted-foreground" }, fontSize + "px")
          )
        ),
        /* Session list */
        React.createElement(
          "div",
          { className: "flex-1 overflow-y-auto min-h-0 w-full overflow-hidden" },
          sessions.length === 0 &&
            React.createElement(
              "div",
              { className: "p-4 text-xs text-muted-foreground text-center" },
              "No sessions yet"
            ),
          sessions.map((s) =>
            React.createElement(SessionItem, {
              key: s.id,
              session: s,
              isActive: s.id === activeSessionId,
              onClick: () => handleSelectSession(s.id),
              onDelete: () => handleDeleteSession(s.id),
            })
          )
        )
      ),

      /* Main chat area */
      React.createElement(
        "div",
        { className: "flex flex-col flex-1 min-w-0 h-full relative" },
        /* Floating toggle when sidebar collapsed */
        !sidebarOpen &&
          React.createElement(
            "div",
            { className: "absolute top-2 left-2 z-10" },
            React.createElement(
              Button,
              {
                onClick: () => setSidebarOpen(true),
                size: "icon",
                variant: "ghost",
                className: "h-8 w-8 bg-background/60 backdrop-blur-sm hover:bg-background/80 shadow-sm border border-border/30",
                title: "Open sidebar",
              },
              React.createElement(
                "svg",
                { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
                React.createElement("line", { x1: 3, y1: 12, x2: 21, y2: 12 }),
                React.createElement("line", { x1: 3, y1: 6, x2: 21, y2: 6 }),
                React.createElement("line", { x1: 3, y1: 18, x2: 21, y2: 18 })
              )
            )
          ),

        /* Content area: empty state or messages */
        !hasContent
          ? React.createElement(
              "div",
              { className: "flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto" },
              React.createElement(
                "div",
                { className: "flex flex-col items-center mb-6 select-none", style: { fontFamily: "monospace", lineHeight: 1.15 } },
                CADUCEUS_ART.map((line, i) =>
                  React.createElement(
                    "div",
                    {
                      key: i,
                      className: cn(
                        "text-xs md:text-sm whitespace-pre",
                        i < 4 ? "text-amber-400" :
                        i < 8 ? "text-yellow-500" :
                        i < 12 ? "text-amber-600" : "text-yellow-700"
                      ),
                    },
                    line
                  )
                )
              ),
              React.createElement("h1", { className: "text-2xl md:text-3xl font-bold text-foreground tracking-tight mb-1" }, "Nous Hermes"),
              React.createElement("p", { className: "text-sm text-muted-foreground" }, "Messenger of the Digital Gods")
            )
          : React.createElement(
              "div",
              { className: "flex-1 overflow-y-auto min-h-0 px-4 py-4 md:px-6" },
              error &&
                React.createElement(
                  "div",
                  { className: "p-3 mb-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20" },
                  error
                ),
              messages.map((msg, idx) =>
                React.createElement(ChatBubble, {
                  key: idx,
                  role: msg.role,
                  content: msg.content,
                  fontSize,
                })
              ),
              streamingContent &&
                React.createElement(ChatBubble, {
                  role: "assistant",
                  content: streamingContent,
                  isStreaming: true,
                  fontSize,
                }),
              React.createElement("div", { ref: messagesEndRef })
            ),

        /* Input bar - always visible */
        React.createElement(
          "div",
          { className: "flex-shrink-0 border-t border-border p-3 md:p-4" },
          React.createElement(
            "div",
            { className: "flex gap-2 items-end" },
            React.createElement(Input, {
              ref: inputRef,
              value: inputValue,
              onChange: (e) => setInputValue(e.target.value),
              onKeyDown: handleKeyDown,
              placeholder: "Message Hermes...",
              disabled: isLoading,
              className: "flex-1 min-h-[44px]",
              style: fontSize ? { fontSize: `${fontSize}px` } : {},
            }),
            React.createElement(
              Button,
              {
                onClick: handleSend,
                disabled: isLoading || !inputValue.trim(),
                size: "default",
              },
              isLoading ? "\u2026" : "Send"
            )
          ),
          activeSessionId &&
            React.createElement(
              "div",
              { className: "text-[10px] text-muted-foreground text-center mt-1" },
              "Session: ",
              activeSessionId.slice(0, 20),
              "\u2026"
            ),
          selectedModel &&
            React.createElement(
              "div",
              { className: "text-[10px] text-muted-foreground text-center mt-0.5" },
              "Model: ",
              selectedModel
            )
        )
      )
    );
  }

  /* Register */
  window.__HERMES_PLUGINS__.register("webui", WebUIChat);
})();
