import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

type Status = "idle" | "fetching" | "ready" | "downloading" | "done" | "error";

interface VideoInfo {
  title: string;
  duration: string;
  uploader: string;
}

function App() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [outputDir, setOutputDir] = useState("");
  const [error, setError] = useState("");
  const [resultFile, setResultFile] = useState("");
  const [isMaximized, setIsMaximized] = useState(false);
  const [dots, setDots] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const dotsRef = useRef<ReturnType<typeof setInterval>>(null);

  const appWindow = getCurrentWindow();

  useEffect(() => {
    invoke<string>("get_default_dir").then(setOutputDir).catch(() => {});
    inputRef.current?.focus();
    appWindow.onResized(async () => {
      setIsMaximized(await appWindow.isMaximized());
    });
  }, []);

  useEffect(() => {
    if (status === "fetching" || status === "downloading") {
      setDots(".");
      dotsRef.current = setInterval(() => {
        setDots(prev => prev.length >= 3 ? "." : prev + ".");
      }, 400);
    } else {
      if (dotsRef.current) clearInterval(dotsRef.current);
      setDots("");
    }
    return () => { if (dotsRef.current) clearInterval(dotsRef.current); };
  }, [status]);

  const isValidYoutubeUrl = (value: string) => {
    return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/.test(value);
  };

  const handleUrlChange = async (value: string) => {
    setUrl(value);
    setVideoInfo(null);
    setResultFile("");
    setError("");

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (isValidYoutubeUrl(value)) {
      setStatus("fetching");
      debounceRef.current = setTimeout(async () => {
        try {
          const info = await invoke<VideoInfo>("get_video_info", { url: value });
          setVideoInfo(info);
          setStatus("ready");
        } catch (e) {
          setError(String(e));
          setStatus("error");
        }
      }, 200);
    } else {
      setStatus("idle");
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        handleUrlChange(text);
      }
    } catch {}
  };

  const handleClear = () => {
    setUrl("");
    setVideoInfo(null);
    setResultFile("");
    setError("");
    setStatus("idle");
    inputRef.current?.focus();
  };

  const handleSelectFolder = async () => {
    const selected = await open({ directory: true });
    if (selected) {
      setOutputDir(selected as string);
    }
  };

  const handleDownload = async () => {
    if (!outputDir) {
      setError("Selecciona una carpeta de destino");
      return;
    }
    setStatus("downloading");
    setError("");
    try {
      const filename = await invoke<string>("download_mp3", { url, outputDir });
      setResultFile(filename);
      setStatus("done");
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  };

  const formatDuration = (seconds: string) => {
    const s = parseInt(seconds, 10);
    if (isNaN(s)) return seconds;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const isFetching = status === "fetching";
  const isDownloading = status === "downloading";

  return (
    <div className="app">
      <div className="titlebar" data-tauri-drag-region>
        <span className="titlebar-title">Converter</span>
        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={() => appWindow.minimize()} aria-label="Minimizar">
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1" rx="0.5" fill="currentColor"/></svg>
          </button>
          <button className="titlebar-btn" onClick={() => appWindow.toggleMaximize()} aria-label="Maximizar">
            {isMaximized ? (
              <svg width="12" height="12" viewBox="0 0 12 12"><rect x="3.5" y="1" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1" fill="none"/><rect x="1.5" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1" fill="var(--bg)"/></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
            )}
          </button>
          <button className="titlebar-btn titlebar-close" onClick={() => appWindow.close()} aria-label="Cerrar">
            <svg width="12" height="12" viewBox="0 0 12 12"><line x1="3" y1="3" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="9" y1="3" x2="3" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>

      <div className="content-scroll">
      <header className="header">
        <div className="logo-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <h1>Converter</h1>
        <p className="subtitle">YouTube a MP3</p>
      </header>

      <div className="input-section">
        <div className={`input-wrapper ${isFetching ? "input-fetching" : ""} ${status === "ready" ? "input-ready" : ""} ${status === "error" ? "input-error" : ""} ${isDownloading ? "input-downloading" : ""}`}>
          {(isFetching || isDownloading) ? (
            <div className="spinner-css" />
          ) : (
            <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
          <input
            ref={inputRef}
            type="text"
            placeholder={isFetching ? "Buscando pista..." : "Pega un link de YouTube..."}
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            className="url-input"
            disabled={isDownloading}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {url && !isDownloading && (
            <button className="btn-icon" onClick={handleClear} aria-label="Limpiar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          {!url && (
            <button className="btn-icon btn-paste" onClick={handlePaste} aria-label="Pegar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          )}
        </div>
        {(isFetching || isDownloading) && (
          <div className="fetch-status">
            <span className="fetch-text">{isFetching ? `Reconociendo pista${dots}` : `Descargando${dots}`}</span>
          </div>
        )}
      </div>

      <div className="content">
        {videoInfo && (
          <div className="video-card">
            <div className="video-card-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <div className="video-info">
                <div className="video-title">{videoInfo.title}</div>
                <div className="video-meta">
                  <span>{videoInfo.uploader}</span>
                  <span className="dot">·</span>
                  <span>{formatDuration(videoInfo.duration)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="output-section">
          <button className="btn btn-folder" onClick={handleSelectFolder} disabled={isDownloading}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="folder-name">
              {outputDir ? outputDir.split(/[/\\]/).filter(Boolean).pop() || outputDir : "Carpeta"}
            </span>
          </button>
          {outputDir && (
            <span className="folder-path">{outputDir}</span>
          )}
        </div>

        {status === "error" && (
          <div className="msg msg-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {status === "done" && (
          <div className="msg msg-success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{resultFile}</span>
          </div>
        )}
      </div>

      <div className="actions">
        <button
          className={`btn btn-download ${status === "ready" ? "btn-ready" : ""}`}
          onClick={handleDownload}
          disabled={status !== "ready" && status !== "downloading"}
        >
          {isDownloading ? (
            <span>Descargando{dots}</span>
          ) : isFetching ? (
            <span>Buscando{dots}</span>
          ) : status === "ready" ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Descargar MP3</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Pega un link para comenzar</span>
            </>
          )}
        </button>
      </div>
      </div>
    </div>
  );
}

export default App;
