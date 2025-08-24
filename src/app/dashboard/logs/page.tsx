
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, doc, getDoc, onSnapshot, query, orderBy, limit, startAfter, getDocs, Timestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Log {
  id: string;
  type: 'WEBHOOK' | 'USER_ACTION';
  timestamp: Timestamp;
  [key: string]: any;
}

interface UserData {
  activeAccountId: string | null;
}

const LOGS_PER_PAGE = 50;

export default function LogsPage() {
  const [user, userLoading] = useAuthState(auth);
  const { toast } = useToast();
  
  const [logs, setLogs] = useState<Log[]>([]);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastVisible, setLastVisible] = useState<any>(null);
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const observer = useRef<IntersectionObserver>();

  // Fetch user data to get active account
  useEffect(() => {
    const fetchUserData = async () => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          setUserData(userDoc.data() as UserData);
        } else {
          setLoading(false);
        }
      }
    };
    if (!userLoading) {
      fetchUserData();
    }
  }, [user, userLoading]);

  const loadMoreLogs = useCallback(async () => {
    if (!userData?.activeAccountId || loadingMore || !hasMore) return;
  
    setLoadingMore(true);
    try {
      const logsRef = collection(db, 'accounts', userData.activeAccountId, 'logs');
      let q = query(logsRef, orderBy('timestamp', 'desc'), limit(LOGS_PER_PAGE));
      
      if (lastVisible) {
        q = query(q, startAfter(lastVisible));
      }
  
      const documentSnapshots = await getDocs(q);
  
      const newLogs = documentSnapshots.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          timestamp: data.timestamp
        } as Log;
      });
  
      const newLastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
      setLastVisible(newLastVisible);
      setLogs(prevLogs => [...prevLogs, ...newLogs]);
      setHasMore(documentSnapshots.docs.length === LOGS_PER_PAGE);
  
    } catch (error) {
      console.error("Error fetching more logs:", error);
      toast({
        title: "Error fetching logs",
        description: error instanceof Error ? error.message : "Could not fetch older logs.",
        variant: "destructive",
      });
    } finally {
      setLoadingMore(false);
    }
  }, [userData?.activeAccountId, loadingMore, hasMore, toast, lastVisible]);
  

  // Initial load
  useEffect(() => {
    if (userData?.activeAccountId) {
      setLoading(true);
      setLogs([]);
      setLastVisible(null);
      setHasMore(true);
      
      // We are calling loadMoreLogs here, but since lastVisible is null, it fetches the first page.
      loadMoreLogs().finally(() => {
          setLoading(false);
          // Scroll to bottom after initial load
          setTimeout(() => {
            const scrollable = scrollContainerRef.current?.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollable) {
                scrollable.scrollTop = scrollable.scrollHeight;
            }
          }, 100);
      });
    } else if (!userLoading && userData) {
      setLoading(false);
    }
    // We want this to run only when userData becomes available.
    // loadMoreLogs is a dependency, so we include it.
  }, [userData, userLoading]);


  const topLoaderRef = useCallback((node: HTMLDivElement) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore) {
        loadMoreLogs();
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore, loadMoreLogs, loadingMore]);


  const LogItem = ({ log }: { log: Log }) => {
    const timestamp = log.timestamp?.toDate().toLocaleString() || 'No date';
    const icon = log.type === 'WEBHOOK' ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />;
    
    let title = `Unknown Event`;
    let description = `Log ID: ${log.id}`;

    if (log.type === 'WEBHOOK') {
        title = `Webhook Received: ${log.topic}`;
        description = `Order ID: ${log.orderId || 'N/A'}`;
    } else if (log.type === 'USER_ACTION') {
        title = `User Action: ${log.action.replace(/_/g, ' ')}`;
        description = `${log.user.displayName} changed order ${log.details.orderId} from ${log.details.oldStatus} to ${log.details.newStatus}`;
    }

    return (
      <div 
        className="flex items-start gap-4 p-4 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors"
        onClick={() => setSelectedLog(log)}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{timestamp}</p>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    );
  };
  
  const reversedLogs = useMemo(() => [...logs].reverse(), [logs]);


  return (
    <>
      <main className="flex flex-1 flex-col p-4 md:p-6">
        <Card className="flex-1 flex flex-col">
          <CardHeader>
            <CardTitle>Activity Logs</CardTitle>
            <CardDescription>
              A stream of all events from Shopify and user actions. Newest logs are at the bottom.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            <ScrollArea className="h-full" ref={scrollContainerRef}>
                <div className="space-y-2">
                    {loading ? (
                        Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4 p-4">
                                <Skeleton className="h-10 w-10 rounded-full" />
                                <div className="space-y-2 flex-1">
                                    <Skeleton className="h-4 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                </div>
                            </div>
                        ))
                    ) : logs.length > 0 ? (
                        <>
                           <div ref={topLoaderRef} className="h-1" />
                            {loadingMore && <div className="p-4 text-center text-sm">Loading older logs...</div>}
                            {reversedLogs.map((log) => <LogItem key={log.id} log={log} />)}
                        </>
                    ) : (
                         <div className="flex items-center justify-center h-full text-muted-foreground">
                            {userData?.activeAccountId ? 'No logs found yet. Activity will appear here.' : 'Please connect a store to see logs.'}
                        </div>
                    )}
                </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
      
      <Dialog open={!!selectedLog} onOpenChange={(isOpen) => !isOpen && setSelectedLog(null)}>
        <DialogContent className="sm:max-w-3xl">
          {selectedLog && (
            <>
              <DialogHeader>
                <DialogTitle>Log Details</DialogTitle>
                <DialogDescription>
                  Raw data for log entry created at {selectedLog.timestamp?.toDate().toLocaleString()}.
                </DialogDescription>
              </DialogHeader>
              <ScrollArea className="max-h-[60vh] mt-4 rounded-md border p-4">
                  <pre className="text-sm">
                    {JSON.stringify(selectedLog, (key, value) => {
                        // Convert Firestore Timestamps to readable strings
                        if (value && value.seconds && typeof value.toDate === 'function') {
                            return value.toDate().toISOString();
                        }
                        return value;
                    }, 2)}
                  </pre>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

