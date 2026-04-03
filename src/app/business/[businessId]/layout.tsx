// app/business/[businessId]/layout.tsx
'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useBusinessAuthorization } from '@/hooks/use-business-authorization';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from 'react';
import { Building2, ShieldX, Home, ArrowLeft, Sparkles, X, Send, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { db } from '@/lib/firebase';
import {
  doc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import type { AgentSession, AgentMessage, AgentSessionStatus } from '@/types/agent';

// ============================================================
// BUSINESS CONTEXT
// ============================================================

export const BusinessContext = createContext<ReturnType<typeof useBusinessAuthorization> | null>(null);

export function useBusinessContext() {
  const context = useContext(BusinessContext);
  if (!context) throw new Error('useBusinessContext must be used within BusinessLayout');
  return context;
}

// ============================================================
// AUTH STATES
// ============================================================

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '700ms' }} />
      </div>
      <div className="relative z-10 flex flex-col items-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-primary/20 border-t-primary animate-spin" style={{ animationDuration: '1.5s' }} />
          <div className="absolute inset-1.5 w-[68px] h-[68px] rounded-full border border-primary/10 border-b-primary/40 animate-spin" style={{ animationDuration: '2s', animationDirection: 'reverse' }} />
          <div className="absolute inset-3 w-14 h-14 rounded-full bg-primary/10 animate-pulse" />
          <div className="relative w-20 h-20 flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Loading Business</h2>
          <p className="text-sm text-muted-foreground">Verifying your access permissions...</p>
        </div>
        <div className="mt-6 w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ animation: 'progress 1.5s ease-in-out infinite' }} />
        </div>
      </div>
      <style jsx>{`
        @keyframes progress {
          0% { width: 0%; margin-left: 0%; }
          50% { width: 60%; margin-left: 20%; }
          100% { width: 0%; margin-left: 100%; }
        }
      `}</style>
    </div>
  );
}

function NotAuthorizedState() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-muted/30 rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 text-center space-y-8 max-w-md px-6">
        <div className="relative">
          <div className="text-[180px] font-bold text-muted/30 leading-none select-none">404</div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl scale-150" />
              <div className="relative rounded-full bg-gradient-to-br from-muted to-muted/80 p-6 shadow-lg border border-border/50">
                <ShieldX className="h-12 w-12 text-muted-foreground" />
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">Business Not Found</h1>
          <p className="text-muted-foreground leading-relaxed">
            The business you&apos;re looking for doesn&apos;t exist or you don&apos;t have permission to access it.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button variant="outline" onClick={() => router.back()} className="gap-2 w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4" />Go Back
          </Button>
          <Button onClick={() => router.push('/business')} className="gap-2 w-full sm:w-auto">
            <Home className="h-4 w-4" />My Businesses
          </Button>
        </div>
        <p className="text-xs text-muted-foreground pt-4">
          If you believe this is an error, please contact your administrator.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// CHAT TYPES
// ============================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ============================================================
// LOADING DOTS
// ============================================================

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5 px-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.85, 1, 0.85] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ============================================================
// MESSAGE BUBBLE
// ============================================================

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn('flex items-end gap-2 mb-3', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {!isUser && (
        <div className="shrink-0 mb-0.5">
          <div className="w-5 h-5 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center">
            <Sparkles className="w-2.5 h-2.5 text-primary" />
          </div>
        </div>
      )}
      <div
        className={cn(
          'max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm shadow-sm shadow-primary/20'
            : 'bg-muted text-foreground rounded-bl-sm border border-border/40'
        )}
      >
        {isUser ? (
          // User messages — plain text, no markdown needed
          message.content
        ) : (
          // Assistant messages — full markdown rendering
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Paragraphs — no extra margin on first/last to keep bubble padding clean
              p: ({ children }) => (
                <p className="mb-2 last:mb-0">{children}</p>
              ),
              // Bold
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{children}</strong>
              ),
              // Italic
              em: ({ children }) => (
                <em className="italic">{children}</em>
              ),
              // Unordered lists
              ul: ({ children }) => (
                <ul className="mt-1 mb-2 last:mb-0 space-y-0.5 pl-4 list-disc">{children}</ul>
              ),
              // Ordered lists
              ol: ({ children }) => (
                <ol className="mt-1 mb-2 last:mb-0 space-y-0.5 pl-4 list-decimal">{children}</ol>
              ),
              // List items
              li: ({ children }) => (
                <li className="leading-relaxed">{children}</li>
              ),
              // Inline code
              code: ({ inline, children }: any) =>
                inline ? (
                  <code className="px-1 py-0.5 rounded bg-background/60 border border-border/40 font-mono text-[11px]">
                    {children}
                  </code>
                ) : (
                  <code className="block mt-1.5 mb-2 last:mb-0 px-3 py-2 rounded-lg bg-background/60 border border-border/40 font-mono text-[11px] whitespace-pre-wrap overflow-x-auto">
                    {children}
                  </code>
                ),
              // Code blocks (wraps inline code above)
              pre: ({ children }) => <>{children}</>,
              // Headings — unlikely in chat but handle gracefully
              h1: ({ children }) => <p className="font-bold text-base mb-1">{children}</p>,
              h2: ({ children }) => <p className="font-bold mb-1">{children}</p>,
              h3: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
              // Horizontal rule
              hr: () => <hr className="my-2 border-border/40" />,
              // Links — open in new tab
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 text-primary hover:opacity-80 transition-opacity"
                >
                  {children}
                </a>
              ),
              // Blockquote
              blockquote: ({ children }) => (
                <blockquote className="pl-3 border-l-2 border-border/60 text-muted-foreground my-1.5">
                  {children}
                </blockquote>
              ),
            }}
          >
            {message.content}
          </ReactMarkdown>
        )}
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground/50 mb-0.5 select-none">
        {format(message.timestamp, 'h:mm a')}
      </span>
    </motion.div>
  );
}

// Loading bubble — separate from real messages, driven by session status
function LoadingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex items-end gap-2 mb-3"
    >
      <div className="shrink-0 mb-0.5">
        <div className="w-5 h-5 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center">
          <Sparkles className="w-2.5 h-2.5 text-primary" />
        </div>
      </div>
      <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-muted border border-border/40">
        <LoadingDots />
      </div>
    </motion.div>
  );
}

// ============================================================
// PEEK BUTTON
// ============================================================

const MOUSE_THRESHOLD_PX = 100;

function MajimeAgentPeekButton({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  const [mouseNear, setMouseNear] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      setMouseNear(window.innerWidth - e.clientX < MOUSE_THRESHOLD_PX);
    };
    window.addEventListener('mousemove', onMouseMove);
    return () => window.removeEventListener('mousemove', onMouseMove);
  }, []);

  const peekX = isHovered ? '0%' : mouseNear ? '33%' : '92%';

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.div
          onPointerDownCapture={(e) => e.stopPropagation()}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-[9999] cursor-pointer"
          style={{ pointerEvents: 'auto' }}
          initial={{ x: '92%' }}
          animate={{ x: peekX }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={onClick}
          aria-label="Open Majime Agent"
          role="button"
        >
          <div
            className={cn(
              'flex items-center gap-3 pl-4 pr-3 py-4',
              'bg-primary text-primary-foreground',
              'rounded-l-2xl',
              'shadow-xl shadow-primary/30',
              'select-none',
            )}
          >
            <div className="text-left">
              <p className="text-[11px] font-medium text-primary-foreground/70 leading-none mb-0.5 uppercase tracking-wide">
                Ask the
              </p>
              <p className="text-sm font-bold leading-none whitespace-nowrap">
                Majime Agent!
              </p>
            </div>
            <div className="shrink-0 w-9 h-9 rounded-xl bg-primary-foreground/15 border border-primary-foreground/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// CHAT PANEL
//
// Owns: input text + local isSending only.
// messages, sessionId, sessionStatus, generatingStartedAt all flow
// in from BusinessLayout, driven entirely by Firestore onSnapshot.
// ============================================================

// How long before we treat a stuck 'generating' lock as stale
const STALE_GENERATING_MS = 30_000;

function MajimeAgentChatPanel({
  isOpen,
  onClose,
  businessId,
  sessionId,
  sessionLoading,
  sessionStatus,
  generatingStartedAt,
  messages,
  onSend,
}: {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  sessionId: string | null;
  sessionLoading: boolean;
  sessionStatus: AgentSessionStatus | null;
  generatingStartedAt: Date | null;
  messages: ChatMessage[];
  onSend: (content: string) => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Stale lock: if 'generating' hasn't resolved in 30s, unblock the user
  const isStaleGenerating =
    sessionStatus === 'generating' &&
    generatingStartedAt !== null &&
    Date.now() - generatingStartedAt.getTime() > STALE_GENERATING_MS;

  // Input is blocked while the agent is generating (unless the lock is stale)
  const isBlocked =
    !sessionId ||
    sessionLoading ||
    isSending ||
    (sessionStatus === 'generating' && !isStaleGenerating);

  // Auto-scroll on new messages or status change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sessionStatus]);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen && sessionId && !isBlocked) {
      const t = setTimeout(() => textareaRef.current?.focus(), 320);
      return () => clearTimeout(t);
    }
  }, [isOpen, sessionId, isBlocked]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isBlocked) return;
    const content = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsSending(true);
    try {
      await onSend(content);
    } finally {
      setIsSending(false);
    }
  }, [input, isBlocked, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  // Derive header indicator
  const indicatorState: 'loading' | 'generating' | 'error' | 'online' =
    sessionLoading ? 'loading'
      : sessionStatus === 'generating' && !isStaleGenerating ? 'generating'
        : sessionStatus === 'error' || isStaleGenerating ? 'error'
          : 'online';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed bottom-0 right-0 z-[9999] flex flex-col"
          style={{
            width: 'clamp(320px, 550px, 100vw)',
            height: 'calc(100dvh - 1.5rem)',
            pointerEvents: 'auto',
          }}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 33 }}
        >
          <div className="flex flex-col h-full bg-background border-l border-t border-border/60 rounded-tl-2xl shadow-2xl shadow-black/15 overflow-hidden">

            {/* ── Header ── */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-gradient-to-r from-primary/5 via-primary/[0.03] to-transparent">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="shrink-0 w-8 h-8 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-none">Majime Assistant</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-none">Your platform guide</p>
                </div>
              </div>

              {/* Status indicator */}
              <div className="flex items-center gap-1.5 shrink-0">
                {indicatorState === 'loading' && (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium">Starting…</span>
                  </>
                )}
                {indicatorState === 'generating' && (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium">Thinking…</span>
                  </>
                )}
                {indicatorState === 'error' && (
                  <>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
                    <span className="text-[11px] text-destructive font-medium">Error</span>
                  </>
                )}
                {indicatorState === 'online' && (
                  <>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium">Online</span>
                  </>
                )}
              </div>

              {/* Hide panel — session stays alive */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                onClick={onClose}
                title="Hide chat"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 scroll-smooth">

              {/* Session starting skeleton */}
              {sessionLoading && messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-8">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Starting session…</p>
                    <p className="text-xs text-muted-foreground mt-1">Setting things up</p>
                  </div>
                </div>
              )}

              {/* Error banner */}
              {(sessionStatus === 'error' || isStaleGenerating) && (
                <div className="mb-3 mx-1 px-3.5 py-2.5 rounded-xl bg-destructive/8 border border-destructive/20 text-xs text-destructive">
                  Something went wrong generating a response. You can try sending your message again.
                </div>
              )}

              {/* Message list */}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {/* Loading bubble — shown while agent is generating, driven by Firestore status */}
              <AnimatePresence>
                {sessionStatus === 'generating' && !isStaleGenerating && (
                  <LoadingBubble key="loading-bubble" />
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>

            {/* ── Session divider ── */}
            {sessionId && (
              <div className="px-4 py-1 flex items-center gap-2">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[10px] text-muted-foreground/50 font-mono select-none">
                  Session active
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>
            )}

            {/* ── Input area ── */}
            <div className="shrink-0 border-t border-border/50 bg-background/70 backdrop-blur-sm px-3 pb-3 pt-2.5">
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    sessionLoading ? 'Starting session…'
                      : sessionStatus === 'generating' ? 'Waiting for response…'
                        : 'Ask anything about Majime…'
                  }
                  rows={1}
                  disabled={isBlocked}
                  className={cn(
                    'flex-1 resize-none rounded-xl border border-border/60 bg-muted/40',
                    'px-3.5 py-2.5 text-sm leading-relaxed',
                    'placeholder:text-muted-foreground/60',
                    'focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary/40',
                    'min-h-[42px] max-h-[120px]',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'transition-all duration-150',
                  )}
                />
                <Button
                  size="icon"
                  className="shrink-0 h-[42px] w-[42px] rounded-xl shadow-sm"
                  onClick={handleSend}
                  disabled={!input.trim() || isBlocked}
                  title="Send message"
                >
                  <AnimatePresence mode="wait">
                    {isSending ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0, rotate: -90 }}
                        animate={{ opacity: 1, rotate: 0 }}
                        exit={{ opacity: 0, rotate: 90 }}
                        transition={{ duration: 0.15 }}
                      >
                        <RotateCcw className="h-4 w-4 animate-spin" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="send"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                      >
                        <Send className="h-4 w-4" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/45 mt-2 text-center select-none">
                <kbd className="px-1 py-px rounded bg-muted/80 border border-border/50 text-[10px]">Enter</kbd>
                {' '}to send &nbsp;·&nbsp;{' '}
                <kbd className="px-1 py-px rounded bg-muted/80 border border-border/50 text-[10px]">Shift + Enter</kbd>
                {' '}for new line
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// BUSINESS LAYOUT
//
// Session lifecycle lives here — not in the panel — so that the
// session and message history survive page-to-page navigation
// within the /business/[businessId]/* subtree.
//
// Session lifecycle:
//   Open chat (first time) → initSession() → API creates Firestore doc
//   Two onSnapshot listeners:
//     1. Session doc     → drives status + generatingStartedAt
//     2. Messages subcol → drives message list (ordered by createdAt)
//   User sends message   → addDoc() directly to messages subcollection
//   Cloud Function fires → sets status='generating', writes reply, sets status='idle'
//   Navigate pages       → layout never unmounts, session + messages persist
//   Close panel (X)      → panel hides, session stays active
//   Page close/refresh   → beforeunload keepalive fetch → end session API
//   Layout unmounts      → cleanup endSession + unsubscribe both snapshots
// ============================================================

export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const businessId = params?.businessId as string;

  const businessAuth = useBusinessAuthorization(businessId);
  const { isAuthorized, loading, user } = businessAuth;
  const idTokenRef = useRef<string | null>(null);

  // ── Chat UI state ────────────────────────────────────────────────────────
  const [isChatOpen, setIsChatOpen] = useState(false);

  // ── Session state — driven by Firestore onSnapshot ───────────────────────
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<AgentSessionStatus | null>(null);
  const [generatingStartedAt, setGeneratingStartedAt] = useState<Date | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Refs — so beforeunload, endSession, and async callbacks always see
  // the latest values without stale closure issues.
  const sessionIdRef = useRef<string | null>(null);
  const sessionLoadingRef = useRef(false);

  // Two separate unsubscribes for the two onSnapshot listeners
  const unsubSessionRef = useRef<(() => void) | null>(null);
  const unsubMessagesRef = useRef<(() => void) | null>(null);

  // Keep refs in sync
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { sessionLoadingRef.current = sessionLoading; }, [sessionLoading]);

  // Keep token fresh — refresh every 50 minutes (tokens expire at 60)
  useEffect(() => {
    if (!user) return;
    const refreshToken = async () => {
      idTokenRef.current = await user.getIdToken();
    };
    refreshToken();
    const interval = setInterval(refreshToken, 50 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  // ── Portal container — appended to <html>, not <body> ───────────────────
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = document.createElement('div');
    container.setAttribute('data-majime-agent', '');
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';

    const blockIfTargetInChat = (e: Event) => {
      if (container.contains(e.target as Node)) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };
    const blockIfFocusMovingToChat = (e: Event) => {
      const relatedTarget = (e as FocusEvent).relatedTarget as Node | null;
      if (relatedTarget && container.contains(relatedTarget)) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    document.addEventListener('focusin', blockIfTargetInChat, true);
    document.addEventListener('focusout', blockIfFocusMovingToChat, true);
    document.addEventListener('pointerdown', blockIfTargetInChat, true);
    document.addEventListener('mousedown', blockIfTargetInChat, true);

    document.documentElement.appendChild(container);
    setPortalContainer(container);

    return () => {
      document.removeEventListener('focusin', blockIfTargetInChat, true);
      document.removeEventListener('focusout', blockIfFocusMovingToChat, true);
      document.removeEventListener('pointerdown', blockIfTargetInChat, true);
      document.removeEventListener('mousedown', blockIfTargetInChat, true);
      if (document.documentElement.contains(container)) {
        document.documentElement.removeChild(container);
      }
    };
  }, []);

  // ── End session — synchronous, safe for both beforeunload and unmount ────
  const endSession = useCallback(() => {
    if (!sessionIdRef.current || !idTokenRef.current) return;
    fetch('/api/business/agent/session/end', {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idTokenRef.current}`,
      },
      body: JSON.stringify({ businessId, sessionId: sessionIdRef.current }),
    });
    sessionIdRef.current = null; // guard against double-fire
  }, [businessId]);

  // ── beforeunload: page close / hard refresh ──────────────────────────────
  useEffect(() => {
    window.addEventListener('beforeunload', endSession);
    return () => window.removeEventListener('beforeunload', endSession);
  }, [endSession]);

  // ── Unmount: client-side navigation away from layout ─────────────────────
  useEffect(() => {
    return () => {
      endSession();
      unsubSessionRef.current?.();
      unsubMessagesRef.current?.();
    };
  }, [endSession]);

  // ── Session init ─────────────────────────────────────────────────────────
  const initSession = useCallback(async () => {
    if (sessionIdRef.current || sessionLoadingRef.current) return;

    sessionLoadingRef.current = true;
    setSessionLoading(true);

    try {
      const res = await fetch('/api/business/agent/session/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idTokenRef.current}`,
        },
        body: JSON.stringify({ businessId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Failed to create session');

      const newSessionId: string = data.sessionId;
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId;

      const sessionDocRef = doc(db, 'users', businessId, 'agent_sessions', newSessionId);
      const messagesQuery = query(
        collection(db, 'users', businessId, 'agent_sessions', newSessionId, 'messages'),
        orderBy('createdAt', 'asc')
      );

      // ── Listener 1: Session doc → status + generatingStartedAt ─────────────
      unsubSessionRef.current = onSnapshot(sessionDocRef, (snap) => {
        if (!snap.exists()) return;
        const s = snap.data() as AgentSession;
        setSessionStatus(s.status);
        setGeneratingStartedAt(s.generatingStartedAt ? s.generatingStartedAt.toDate() : null);
      });

      // ── Listener 2: Messages subcollection → message list ──────────────────
      unsubMessagesRef.current = onSnapshot(messagesQuery, (snap) => {
        const msgs: ChatMessage[] = snap.docs.map((d) => {
          const m = d.data() as AgentMessage;
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.createdAt.toDate(),
          };
        });

        // Show welcome message until the first real message arrives
        if (msgs.length === 0) {
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content: "Hi! I'm the Majime Assistant. I can help you navigate the platform, look up orders, lots, warehouse data, and guide you through any workflow. What would you like to know?",
              timestamp: new Date(),
            },
          ]);
        } else {
          setMessages(msgs);
        }
      });

    } catch (err) {
      console.error('❌ Failed to init agent session:', err);
    } finally {
      sessionLoadingRef.current = false;
      setSessionLoading(false);
    }
  }, [businessId]);

  // ── Send message — writes directly to Firestore messages subcollection ───
  // Cloud Function (onDocumentCreated) picks it up and generates the reply.
  const handleSend = useCallback(async (content: string) => {
    if (!sessionIdRef.current) return;

    const messagesColRef = collection(
      db, 'users', businessId, 'agent_sessions', sessionIdRef.current, 'messages'
    );

    const newDocRef = await addDoc(messagesColRef, {
      role: 'user',
      content,
      createdAt: Timestamp.now(),
    });

    // Write id back so it mirrors the doc ID — keeps AgentMessage shape consistent
    await updateDoc(newDocRef, { id: newDocRef.id });
  }, [businessId]);

  // ── Open handler ─────────────────────────────────────────────────────────
  const handleChatOpen = useCallback(() => {
    setIsChatOpen(true);
    initSession();
  }, [initSession]);

  // ── Auth redirect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return;
    if (isAuthorized && pathname === `/business/${businessId}`) {
      router.push(`/business/${businessId}/dashboard/orders`);
    }
  }, [isAuthorized, loading, businessId, pathname, router]);

  if (loading) return <LoadingState />;
  if (!isAuthorized) return <NotAuthorizedState />;

  return (
    <BusinessContext.Provider value={businessAuth}>
      {children}

      {portalContainer && createPortal(
        <>
          {/* Peek tab — right edge, vertically centred */}
          <MajimeAgentPeekButton
            isOpen={isChatOpen}
            onClick={handleChatOpen}
          />

          {/* Chat panel — slides in from right */}
          <MajimeAgentChatPanel
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            businessId={businessId}
            sessionId={sessionId}
            sessionLoading={sessionLoading}
            sessionStatus={sessionStatus}
            generatingStartedAt={generatingStartedAt}
            messages={messages}
            onSend={handleSend}
          />
        </>,
        portalContainer
      )}
    </BusinessContext.Provider>
  );
}