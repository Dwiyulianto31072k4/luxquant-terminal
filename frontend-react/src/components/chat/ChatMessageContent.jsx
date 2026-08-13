import { useEffect, useRef, useState } from "react";
import { useDialog } from "../../hooks/useDialog";
import Modal from "../ui/Modal";

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

const cleanUrlTail = (raw) => {
  let url = raw;
  let tail = "";
  while (/[),.!?:;]$/.test(url)) {
    const char = url.slice(-1);
    if (char === ")" && (url.match(/\(/g)?.length || 0) >= (url.match(/\)/g)?.length || 0)) break;
    tail = char + tail;
    url = url.slice(0, -1);
  }
  return { url, tail };
};

export const LinkifiedText = ({ text, className = "" }) => {
  const chunks = String(text || "").split(URL_RE);
  return (
    <span className={className}>
      {chunks.map((chunk, index) => {
        if (!/^(?:https?:\/\/|www\.)/i.test(chunk)) return chunk;
        const { url, tail } = cleanUrlTail(chunk);
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        return (
          <span key={`${url}-${index}`}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline decoration-current/35 underline-offset-2 hover:decoration-current"
              onClick={(event) => event.stopPropagation()}
            >
              {url}
            </a>
            {tail}
          </span>
        );
      })}
    </span>
  );
};

export const isChatImage = (message) =>
  message?.kind === "image" &&
  typeof message?.body === "string" &&
  message.body.startsWith("/api/v1/chat-images/");

export const ChatMessageBody = ({ message, onOpenImage, imageClassName = "" }) => {
  if (message?.expired || message?.kind === "expired_image") {
    return (
      <span className="inline-flex items-center gap-1.5 px-1 py-0.5 italic text-current/60">
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M10 5.5v4l2.5 1.5M10 2.75a7.25 7.25 0 1 0 7.25 7.25A7.25 7.25 0 0 0 10 2.75Z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Image expired after 24 hours
      </span>
    );
  }

  if (message?.deleted || message?.kind === "deleted") {
    return (
      <span className="inline-flex items-center gap-1.5 px-1 py-0.5 italic text-current/60">
        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M4.5 5.5h11m-7.5 0V4h4v1.5m-6 0 .7 10h6.6l.7-10" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Message deleted
      </span>
    );
  }

  if (isChatImage(message)) {
    return (
      <button
        type="button"
        onClick={() => onOpenImage?.(message.body)}
        className="group relative block overflow-hidden rounded-xl bg-black/5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Open image preview"
      >
        <img
          src={message.body}
          alt="Chat attachment"
          loading="lazy"
          className={`h-auto w-auto object-contain transition-transform duration-200 group-hover:scale-[1.015] ${imageClassName}`}
        />
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
            <path d="M7.5 3.5h-4v4m9-4h4v4m-9 9h-4v-4m9 4h4v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
    );
  }

  return <LinkifiedText text={message?.body} className="whitespace-pre-wrap break-words" />;
};

export const ChatImageLightbox = ({ src, onClose }) => {
  const dialogRef = useRef(null);
  useDialog({ isOpen: !!src, onClose, ref: dialogRef });
  if (!src) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      tabIndex={-1}
      className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div className="relative flex max-h-full max-w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
        <img src={src} alt="Chat attachment preview" className="max-h-[calc(100dvh-3rem)] max-w-[calc(100vw-2rem)] rounded-xl object-contain shadow-2xl sm:max-h-[calc(100dvh-5rem)]" />
        <div className="absolute right-2 top-2 flex gap-2">
          <a
            href={src}
            download
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75"
            aria-label="Download image"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 15.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75"
            aria-label="Close image preview"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export const ChatImageSendModal = ({ file, sending, onCancel, onSend }) => {
  const [preview, setPreview] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return undefined;
    }
    const next = URL.createObjectURL(file);
    setPreview(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return (
    <Modal
      isOpen={!!file}
      onClose={() => {
        if (!sending) onCancel?.();
      }}
      title="Send image"
      subtitle={file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "Preview attachment"}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={sending} className="px-3 py-2 text-xs text-text-muted hover:text-text-primary disabled:opacity-40">Cancel</button>
          <button type="button" onClick={onSend} disabled={sending || !file} className="lq-cta-md min-w-24 px-4 py-2 text-xs disabled:opacity-40">{sending ? "Sending…" : "Send image"}</button>
        </div>
      }
    >
      <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-xl bg-ink/[0.04] p-3">
        {preview ? <img src={preview} alt="Attachment preview" className="max-h-[55dvh] max-w-full rounded-lg object-contain" /> : null}
      </div>
    </Modal>
  );
};
