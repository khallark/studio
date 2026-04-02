// app/business/[businessId]/layout.tsx
'use client';

import { useParams, usePathname, useRouter } from 'next/navigation';
import { useBusinessAuthorization } from '@/hooks/use-business-authorization';
import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { Building2, ShieldX, Home, ArrowLeft, Sparkles, X, Send, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { createPortal } from 'react-dom';

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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
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
          'max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm shadow-sm shadow-primary/20'
            : 'bg-muted text-foreground rounded-bl-sm border border-border/40'
        )}
      >
        {message.isLoading ? <LoadingDots /> : message.content}
      </div>
      {!message.isLoading && (
        <span className="shrink-0 text-[10px] text-muted-foreground/50 mb-0.5 select-none">
          {format(message.timestamp, 'h:mm a')}
        </span>
      )}
    </motion.div>
  );
}

// ============================================================
// PEEK BUTTON
// ============================================================

const MOUSE_THRESHOLD_PX = 50;

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

  const peekX = isHovered ? '0%' : mouseNear ? '33%' : '90%';

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.div
          onPointerDownCapture={(e) => e.stopPropagation()}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-[9999] cursor-pointer"
          style={{ pointerEvents: 'auto' }}
          initial={{ x: '90%' }}
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
// ============================================================

function MajimeAgentChatPanel({
  isOpen,
  onClose,
  businessId,
}: {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION INIT
  // ─────────────────────────────────────────────────────────────────────────
  // TODO (Backend): When `isOpen` becomes true and no `sessionId` exists,
  //   create or resume the session document in Firestore:
  //
  //   Path: users/{businessId}/chat_session  (single doc, or subcollection if multi-session)
  //
  //   Create:
  //     import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
  //     const sessionRef = doc(db, 'users', businessId, 'chat_session', 'active');
  //     await setDoc(sessionRef, {
  //       startedAt: serverTimestamp(),
  //       status: 'active',
  //       businessId,
  //       messages: [],
  //     }, { merge: true });
  //     setSessionId('active');
  //
  //   Then subscribe with onSnapshot to sync messages written by the Cloud Function:
  //     onSnapshot(sessionRef, (snap) => {
  //       if (snap.exists()) {
  //         const data = snap.data();
  //         // hydrate messages from data.messages if needed
  //       }
  //     });
  //
  //   Return the unsubscribe fn from useEffect cleanup.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || sessionId) return;
    const stubId = `session_${Date.now()}`;
    setSessionId(stubId);
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          "Hi! I'm the Majime Assistant. I can help you navigate the platform, look up orders, lots, warehouse data, and guide you through any workflow. What would you like to know?",
        timestamp: new Date(),
      },
    ]);
  }, [isOpen, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => textareaRef.current?.focus(), 320);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ─────────────────────────────────────────────────────────────────────────
  // SEND MESSAGE
  // ─────────────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const loadingId = `loading_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: loadingId, role: 'assistant', content: '', timestamp: new Date(), isLoading: true },
    ]);

    // ─────────────────────────────────────────────────────────────────────
    // AGENT API CALL
    // ─────────────────────────────────────────────────────────────────────
    // TODO (Backend): Replace the stub below with a call to your Cloud Function:
    //
    //   import { getFunctions, httpsCallable } from 'firebase/functions';
    //   const functions = getFunctions();
    //   const majimeAgent = httpsCallable(functions, 'majimeAgent');
    //
    //   const { data } = await majimeAgent({
    //     conversationId: sessionId,
    //     message: userMsg.content,
    //     currentPage: window.location.pathname,
    //   });
    //
    //   setMessages(prev =>
    //     prev.filter(m => m.id !== loadingId).concat({
    //       id: `assistant_${Date.now()}`,
    //       role: 'assistant',
    //       content: data.reply,
    //       timestamp: new Date(),
    //     })
    //   );
    // ─────────────────────────────────────────────────────────────────────

    // STUB: remove when backend is ready
    await new Promise((r) => setTimeout(r, 1400));
    setMessages((prev) =>
      prev
        .filter((m) => m.id !== loadingId)
        .concat({
          id: `assistant_${Date.now()}`,
          role: 'assistant',
          content:
            "The Majime Agent backend isn't connected yet — but once it is, I'll be able to look up your orders, lots, warehouse data, and more in real time. Stay tuned!",
          timestamp: new Date(),
        })
    );
    setIsLoading(false);
  }, [input, isLoading, sessionId]);

  // ─────────────────────────────────────────────────────────────────────────
  // END CONVERSATION
  // ─────────────────────────────────────────────────────────────────────────
  const handleEndConversation = useCallback(() => {
    // TODO (Backend): Mark session as ended in Firestore before clearing:
    //
    //   import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
    //   if (sessionId) {
    //     await updateDoc(
    //       doc(db, 'users', businessId, 'chat_session', sessionId),
    //       { status: 'ended', endedAt: serverTimestamp() }
    //     );
    //   }

    setMessages([]);
    setSessionId(null);
    setInput('');
    setIsLoading(false);
    onClose();
  }, [onClose]);

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

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed bottom-0 right-0 z-[9999] flex flex-col"
          style={{
            width: 'clamp(320px, 400px, 100vw)',
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
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[11px] text-muted-foreground font-medium">Online</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                onClick={handleEndConversation}
                title="End this conversation"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 scroll-smooth">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-8">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Starting session…</p>
                    <p className="text-xs text-muted-foreground mt-1">Setting up your conversation</p>
                  </div>
                </div>
              )}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Session divider ── */}
            {sessionId && (
              <div className="px-4 py-1 flex items-center gap-2">
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[10px] text-muted-foreground/50 font-mono select-none">
                  {/* TODO (Backend): Show "session started at HH:mm" once Firestore session is real */}
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
                  placeholder="Ask anything about Majime…"
                  rows={1}
                  disabled={!sessionId || isLoading}
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
                  disabled={!input.trim() || isLoading || !sessionId}
                  title="Send message"
                >
                  <AnimatePresence mode="wait">
                    {isLoading ? (
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
  const { isAuthorized, loading } = businessAuth;

  const [isChatOpen, setIsChatOpen] = useState(false);

  // ── Portal container — appended to <html>, not <body> ───────────────────
  // hideOthers (used internally by all Radix components) only walks children
  // of <body>. Mounting the chat as a child of <html> puts it completely
  // outside that scope — no Radix component can ever set aria-hidden or
  // inert on it, regardless of version or component type.
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = document.createElement('div');
    container.setAttribute('data-majime-agent', '');
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;';

    // Register on document in CAPTURE phase, BEFORE any Radix dialog ever opens.
    // This guarantees our handler is first in the queue.
    // stopImmediatePropagation kills all subsequent capture handlers on document
    // (Radix's FocusScope + outside-click detectors) when event is inside chat.
    const blockIfInChat = (e: Event) => {
      if (container.contains(e.target as Node)) {
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    };

    document.addEventListener('pointerdown', blockIfInChat, true);
    document.addEventListener('focusin', blockIfInChat, true);
    document.addEventListener('mousedown', blockIfInChat, true); // some Radix versions use mousedown

    document.documentElement.appendChild(container);
    setPortalContainer(container);

    return () => {
      document.removeEventListener('pointerdown', blockIfInChat, true);
      document.removeEventListener('focusin', blockIfInChat, true);
      document.removeEventListener('mousedown', blockIfInChat, true);
      if (document.documentElement.contains(container)) {
        document.documentElement.removeChild(container);
      }
    };
  }, []);

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
            onClick={() => setIsChatOpen(true)}
          />
          {/* Chat panel — slides in from right */}
          <MajimeAgentChatPanel
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            businessId={businessId}
          />
        </>,
        portalContainer
      )}
    </BusinessContext.Provider>
  );
}