
// 'use client';

// import React, { useState, useEffect, useCallback, useRef } from 'react';
// import { useAuthState } from 'react-firebase-hooks/auth';
// import { auth, db } from '@/lib/firebase';
// import { collection, doc, getDoc, query, orderBy, limit, startAfter, getDocs, Timestamp, onSnapshot, where } from 'firebase/firestore';
// import { useToast } from '@/hooks/use-toast';
// import { Skeleton } from '@/components/ui/skeleton';
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
// import { Bot, User } from 'lucide-react';
// import { ScrollArea } from '@/components/ui/scroll-area';

// interface Log {
//   id: string;
//   type: 'WEBHOOK' | 'USER_ACTION';
//   action: string;
//   timestamp: Timestamp;
//   [key: string]: any;
// }

// interface UserData {
//   activeAccountId: string | null;
// }

// const LOGS_PER_PAGE = 50;

// export default function LogsPage() {
//   const [user, userLoading] = useAuthState(auth);
//   const { toast } = useToast();
  
//   const [logs, setLogs] = useState<Log[]>([]);
//   const [userData, setUserData] = useState<UserData | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [loadingMore, setLoadingMore] = useState(false);
//   const [hasMore, setHasMore] = useState(true);
//   const [lastVisible, setLastVisible] = useState<any>(null);
//   const [selectedLog, setSelectedLog] = useState<Log | null>(null);

//   const observer = useRef<IntersectionObserver>();
//   const isInitialLoadDone = useRef(false);

//   useEffect(() => {
//     document.title = "Dashboard - Logs";
//   })

//   // Fetch user data to get active account
//   useEffect(() => {
//     const fetchUserData = async () => {
//       if (user) {
//         const userRef = doc(db, 'users', user.uid);
//         const userDoc = await getDoc(userRef);
//         if (userDoc.exists()) {
//           setUserData(userDoc.data() as UserData);
//         } else {
//             setUserData(null);
//         }
//       }
//       // setLoading(false) will be called after initial logs are fetched.
//     };

//     if (!userLoading) {
//       fetchUserData();
//     }
//   }, [user, userLoading]);

//   // Real-time listener for new logs
//   useEffect(() => {
//     if (!userData?.activeAccountId || !isInitialLoadDone.current) return;

//     const logsRef = collection(db, 'accounts', userData.activeAccountId, 'logs');
//     // Listen for logs newer than the newest one we have
//     const newestLogTimestamp = logs.length > 0 ? logs[0].timestamp : new Timestamp(0, 0);

//     const q = query(
//         logsRef, 
//         where('timestamp', '>', newestLogTimestamp),
//         orderBy('timestamp', 'desc')
//     );

//     const unsubscribe = onSnapshot(q, (snapshot) => {
//         const newLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Log));
//         if (newLogs.length > 0) {
//             setLogs(prevLogs => [...newLogs, ...prevLogs]);
//         }
//     }, (error) => {
//         console.error("Error with real-time log listener:", error);
//         toast({
//             title: "Real-time Update Error",
//             description: "Could not listen for new logs.",
//             variant: "destructive",
//         });
//     });

//     return () => unsubscribe();

//   }, [userData?.activeAccountId, logs, toast]);


//   const loadMoreLogs = useCallback(async () => {
//     if (!userData?.activeAccountId || loadingMore || !hasMore) return;
  
//     setLoadingMore(true);

//     try {
//       const logsRef = collection(db, 'accounts', userData.activeAccountId, 'logs');
//       let q = query(logsRef, orderBy('timestamp', 'desc'), limit(LOGS_PER_PAGE));
      
//       if (lastVisible) {
//         q = query(q, startAfter(lastVisible));
//       }
  
//       const documentSnapshots = await getDocs(q);
  
//       const newLogs = documentSnapshots.docs.map(doc => ({
//         id: doc.id,
//         ...doc.data(),
//       } as Log));
  
//       const newLastVisible = documentSnapshots.docs[documentSnapshots.docs.length - 1];
      
//       setHasMore(documentSnapshots.docs.length === LOGS_PER_PAGE);
//       setLastVisible(newLastVisible);
//       setLogs(prevLogs => [...prevLogs, ...newLogs]);
  
//     } catch (error) {
//       console.error("Error fetching more logs:", error);
//       toast({
//         title: "Error fetching logs",
//         description: error instanceof Error ? error.message : "Could not fetch older logs.",
//         variant: "destructive",
//       });
//     } finally {
//       setLoadingMore(false);
//       if (!isInitialLoadDone.current) {
//         setLoading(false);
//         isInitialLoadDone.current = true;
//       }
//     }
//   }, [userData?.activeAccountId, lastVisible, toast, loadingMore, hasMore]);
  
//   // Initial load effect
//   useEffect(() => {
//     if (userData?.activeAccountId && !isInitialLoadDone.current) {
//         setLoading(true);
//         setLogs([]);
//         setLastVisible(null);
//         setHasMore(true);
//         loadMoreLogs();
//     }
//   }, [userData?.activeAccountId, loadMoreLogs]);


//   const bottomLoaderRef = useCallback((node: HTMLDivElement) => {
//     if (loading || loadingMore) return;
//     if (observer.current) observer.current.disconnect();
//     observer.current = new IntersectionObserver(entries => {
//       if (entries[0].isIntersecting && hasMore) {
//         loadMoreLogs();
//       }
//     });
//     if (node) observer.current.observe(node);
//   }, [hasMore, loadMoreLogs, loading, loadingMore]);


//   const LogItem = ({ log }: { log: Log }) => {
//     const timestamp = log.timestamp?.toDate().toLocaleString() || 'No date';
//     const icon = log.type === 'WEBHOOK' ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />;
    
//     let title = `Unknown Event`;
//     let description = `Log ID: ${log.id}`;

//     if (log.type === 'WEBHOOK') {
//         title = `Webhook Received: ${log.topic}`;
//         description = `Order ID: ${log.payload?.name || log.orderId || 'N/A'}`;
//     } else if (log.type === 'USER_ACTION') {
//         const details = log.details || {};
//         title = `User Action: ${log.action.replace(/_/g, ' ')}`;

//         if (log.action === 'BULK_UPDATE_ORDER_STATUS') {
//             description = `${log.user?.displayName || 'A user'} updated ${details.count} order(s) to ${details.newStatus}.`;
//         } else { // Handle single order update
//             description = `${log.user?.displayName || 'A user'} changed order ${details.orderName || details.orderId} from ${details.oldStatus} to ${details.newStatus}.`;
//         }
//     }

//     return (
//       <div 
//         className="flex items-start gap-4 p-4 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors"
//         onClick={() => setSelectedLog(log)}
//       >
//         <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
//             {icon}
//         </div>
//         <div className="flex-1">
//           <div className="flex items-center justify-between">
//             <p className="font-semibold">{title}</p>
//             <p className="text-xs text-muted-foreground">{timestamp}</p>
//           </div>
//           <p className="text-sm text-muted-foreground">{description}</p>
//         </div>
//       </div>
//     );
//   };
  

//   return (
//     <>
//       <main className="flex flex-1 flex-col p-4 md:p-6 h-full">
//         <Card className="flex-1 flex flex-col">
//           <CardHeader>
//             <CardTitle>Activity Logs</CardTitle>
//             <CardDescription>
//               A stream of all events from Shopify and user actions, from newest to oldest. New logs appear in real-time.
//             </CardDescription>
//           </CardHeader>
//           <CardContent className="flex-1 overflow-hidden">
//             <ScrollArea className="h-full">
//                 <div className="space-y-2">
//                     {loading ? (
//                         Array.from({ length: 10 }).map((_, i) => (
//                             <div key={i} className="flex items-center gap-4 p-4">
//                                 <Skeleton className="h-10 w-10 rounded-full" />
//                                 <div className="space-y-2 flex-1">
//                                     <Skeleton className="h-4 w-3/4" />
//                                     <Skeleton className="h-4 w-1/2" />
//                                 </div>
//                             </div>
//                         ))
//                     ) : logs.length > 0 ? (
//                         <>
//                            {logs.map((log) => <LogItem key={log.id} log={log} />)}
//                            {hasMore && <div ref={bottomLoaderRef} className="h-1" />}
//                            {loadingMore && <div className="p-4 text-center text-sm">Loading older logs...</div>}
//                         </>
//                     ) : (
//                          <div className="flex items-center justify-center h-full text-muted-foreground">
//                             {userLoading ? 'Loading user data...' : userData?.activeAccountId ? 'No logs found yet. Activity will appear here.' : 'Please connect a store to see logs.'}
//                         </div>
//                     )}
//                 </div>
//             </ScrollArea>
//           </CardContent>
//         </Card>
//       </main>
      
//       <Dialog open={!!selectedLog} onOpenChange={(isOpen) => !isOpen && setSelectedLog(null)}>
//         <DialogContent className="sm:max-w-3xl">
//           {selectedLog && (
//             <>
//               <DialogHeader>
//                 <DialogTitle>Log Details</DialogTitle>
//                 <DialogDescription>
//                   Raw data for log entry created at {selectedLog.timestamp?.toDate().toLocaleString()}.
//                 </DialogDescription>
//               </DialogHeader>
//               <ScrollArea className="max-h-[60vh] mt-4 rounded-md border p-4">
//                   <pre className="text-sm">
//                     {JSON.stringify(selectedLog, (key, value) => {
//                         // BigInts can't be stringified, so convert to string
//                         if (typeof value === 'bigint') {
//                             return value.toString();
//                         }
//                         if (value && value.seconds && typeof value.toDate === 'function') {
//                             return value.toDate().toISOString();
//                         }
//                         return value;
//                     }, 2)}
//                   </pre>
//               </ScrollArea>
//             </>
//           )}
//         </DialogContent>
//       </Dialog>
//     </>
//   );
// }
