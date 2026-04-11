'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Loader2,
    Camera,
    AlertTriangle,
    CheckCircle2,
    ScanBarcode,
    Package,
    X,
    Video,
    StopCircle,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { storage, auth } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { cn } from '@/lib/utils';
import { Order } from '@/types/order';
import { useMarkOrderPacked } from '@/hooks/use-order-mutations';

// -------------------------------------------------------
// Types
// -------------------------------------------------------

interface StartPackagingDialogProps {
    isOpen: boolean;
    onClose: () => void;
    orders: Order[];           // current page "Ready To Dispatch" orders
    businessId: string;
    user: any;
}

type ScanState = 'idle' | 'found' | 'not-found';

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
};

// -------------------------------------------------------
// Component
// -------------------------------------------------------

export function StartPackagingDialog({
    isOpen,
    onClose,
    orders,
    businessId,
    user,
}: StartPackagingDialogProps) {
    // ---- AWB scan state ----
    const [awbInput, setAwbInput] = useState('');
    const [scanState, setScanState] = useState<ScanState>('idle');
    const [matchedOrder, setMatchedOrder] = useState<Order | null>(null);
    const awbInputRef = useRef<HTMLInputElement>(null);

    // ---- Camera / recording ----
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const [streamReady, setStreamReady] = useState(false);
    const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);

    // ---- Upload state ----
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [lastPackedOrderName, setLastPackedOrderName] = useState<string | null>(null);

    const markPacked = useMarkOrderPacked(businessId, user);

    // -------------------------------------------------------
    // Camera init / cleanup
    // -------------------------------------------------------

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 }, facingMode: { ideal: 'environment' } },
                audio: true,
            });
            streamRef.current = stream;
            setHasCameraPermission(true);
            setStreamReady(true);
            if (videoRef.current) videoRef.current.srcObject = stream;
        } catch {
            setHasCameraPermission(false);
        }
    }, []);

    const stopCameraStream = useCallback(() => {
        // Stop MediaRecorder first if still running
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        // Stop all tracks via the stored ref — reliable even after unmount
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setStreamReady(false);
        setIsRecording(false);
    }, []);

    // Start camera when dialog opens
    useEffect(() => {
        if (isOpen) {
            startCamera();
            setTimeout(() => awbInputRef.current?.focus(), 120);
        } else {
            stopCameraStream();
            resetAll();
        }
        return () => {
            stopCameraStream();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // -------------------------------------------------------
    // Recording timer
    // -------------------------------------------------------

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isRecording) {
            interval = setInterval(() => {
                setRecordingTime((prev) => {
                    if (prev >= 300) {
                        stopRecording();
                        toast({ title: 'Max recording time reached (5 min)' });
                    }
                    return prev + 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRecording]);

    // -------------------------------------------------------
    // AWB real-time validation
    // -------------------------------------------------------

    useEffect(() => {
        const trimmed = awbInput.trim();
        if (!trimmed) {
            setScanState('idle');
            setMatchedOrder(null);
            return;
        }
        const found = orders.find(
            (o) => o.awb && o.awb.trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (found) {
            setScanState('found');
            setMatchedOrder(found);
        } else {
            setScanState('not-found');
            setMatchedOrder(null);
        }
    }, [awbInput, orders]);

    // -------------------------------------------------------
    // Recording helpers
    // -------------------------------------------------------

    const startRecording = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !streamRef.current) return;

        const ctx = canvas.getContext('2d')!;

        // Draw loop — video frame + timestamp burned in
        const drawFrame = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const now = new Date();
            const stamp = now.toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false,
            });

            const padding = 6;
            const fontSize = 13;
            ctx.font = `${fontSize}px monospace`;
            const textWidth = ctx.measureText(stamp).width;

            // Semi-transparent background pill
            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.beginPath();
            ctx.roundRect(8, 8, textWidth + padding * 2, fontSize + padding * 2, 4);
            ctx.fill();

            // Timestamp text
            ctx.fillStyle = '#ffffff';
            ctx.fillText(stamp, 8 + padding, 8 + padding + fontSize - 2);

            animFrameRef.current = requestAnimationFrame(drawFrame);
        };
        drawFrame();

        // Record the canvas stream, not the raw camera stream
        const canvasStream = canvas.captureStream(15); // 15 fps

        // Carry over the audio track from the real stream
        const audioTrack = streamRef.current.getAudioTracks()[0];
        if (audioTrack) canvasStream.addTrack(audioTrack);

        chunksRef.current = [];

        const options = [
            { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 500_000, audioBitsPerSecond: 32_000 },
            { mimeType: 'video/webm', videoBitsPerSecond: 500_000, audioBitsPerSecond: 32_000 },
            {},
        ];

        let recorder: MediaRecorder | null = null;
        for (const opt of options) {
            try {
                if (!opt.mimeType || MediaRecorder.isTypeSupported((opt as any).mimeType)) {
                    recorder = new MediaRecorder(canvasStream, opt as any);
                    break;
                }
            } catch { /* try next */ }
        }
        if (!recorder) recorder = new MediaRecorder(canvasStream);

        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.onstop = () => {
            cancelAnimationFrame(animFrameRef.current); // Stop the draw loop
            const blob = new Blob(chunksRef.current, {
                type: mediaRecorderRef.current?.mimeType || chunksRef.current[0]?.type || 'video/webm'
            });
            setRecordedBlob(blob);
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsRecording(true);
        setRecordingTime(0);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    };

    // -------------------------------------------------------
    // Upload + mark packed
    // -------------------------------------------------------

    const handleSaveVideo = async () => {
        if (!recordedBlob || !matchedOrder) return;
        setIsUploading(true);
        setUploadProgress(0);

        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('Authentication required');

            const fileName = `${matchedOrder.id}_${Date.now()}.webm`;
            const filePath = `packaged_orders/${matchedOrder.storeId}/${fileName}`;
            const videoRef2 = storageRef(storage, filePath);

            const uploadTask = uploadBytesResumable(videoRef2, recordedBlob, {
                contentType: 'video/webm',
            });

            await new Promise<void>((resolve, reject) => {
                uploadTask.on(
                    'state_changed',
                    (snap) => setUploadProgress((snap.bytesTransferred / snap.totalBytes) * 100),
                    reject,
                    resolve
                );
            });

            const downloadUrl = await getDownloadURL(videoRef2);

            // Call mark-packed API via mutation
            await markPacked.mutateAsync({
                orderId: matchedOrder.id,
                storeId: matchedOrder.storeId,
                packingVidUrl: downloadUrl,
            });

            setLastPackedOrderName(matchedOrder.name);

            toast({
                title: 'Packed ✓',
                description: `${matchedOrder.name} marked as packed.`,
            });

            // Reset to allow next scan
            resetSession();
        } catch (err: any) {
            toast({
                title: 'Failed',
                description: err.message || 'Something went wrong.',
                variant: 'destructive',
            });
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    // -------------------------------------------------------
    // Reset helpers
    // -------------------------------------------------------

    /** Resets just the current scan session (keeps camera + dialog open) */
    const resetSession = () => {
        setAwbInput('');
        setScanState('idle');
        setMatchedOrder(null);
        setRecordedBlob(null);
        setRecordingTime(0);
        setIsRecording(false);
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        setTimeout(() => awbInputRef.current?.focus(), 100);
    };

    /** Full reset when dialog closes */
    const resetAll = () => {
        resetSession();
        setLastPackedOrderName(null);
        setHasCameraPermission(null);
        setStreamReady(false);
        setUploadProgress(0);
        setIsUploading(false);
    };

    const handleClose = () => {
        stopCameraStream();
        onClose();
    };

    // -------------------------------------------------------
    // Render
    // -------------------------------------------------------

    const canRecord = scanState === 'found' && !recordedBlob && !isUploading;
    const canSave = scanState === 'found' && !!recordedBlob && !isUploading;

    return (
        <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Start Packaging
                    </DialogTitle>
                    <DialogDescription>
                        Scan or enter an AWB to verify the order, record the packaging video, then save.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid md:grid-cols-2 gap-6 py-2">
                    {/* ---- LEFT: AWB scan + status ---- */}
                    <div className="space-y-5">
                        {/* Success flash */}
                        {lastPackedOrderName && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 text-sm font-medium">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{lastPackedOrderName} packed successfully — ready for next scan</span>
                            </div>
                        )}

                        {/* AWB Input */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold flex items-center gap-1.5">
                                <ScanBarcode className="h-4 w-4" />
                                Scan / Enter AWB
                            </Label>
                            <div className="relative">
                                <Input
                                    ref={awbInputRef}
                                    placeholder="Scan barcode or type AWB..."
                                    value={awbInput}
                                    onChange={(e) => setAwbInput(e.target.value)}
                                    disabled={isUploading}
                                    className={cn(
                                        'pr-8 font-mono transition-colors',
                                        scanState === 'found' && 'border-green-500 ring-1 ring-green-500',
                                        scanState === 'not-found' && awbInput && 'border-destructive ring-1 ring-destructive'
                                    )}
                                    autoComplete="off"
                                />
                                {awbInput && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                                        onClick={resetSession}
                                        disabled={isUploading}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                )}
                            </div>

                            {/* Validation feedback */}
                            {scanState === 'found' && matchedOrder && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                                    <div className="text-sm space-y-0.5">
                                        <p className="font-semibold text-green-700 dark:text-green-400">
                                            Order matched: {matchedOrder.name}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                            {matchedOrder.storeId.split('.')[0]} •{' '}
                                            {matchedOrder.raw.line_items?.length || 0} item(s)
                                        </p>
                                        {matchedOrder.courier && (
                                            <Badge variant="outline" className="text-xs">
                                                {matchedOrder.courier}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            )}

                            {scanState === 'not-found' && awbInput.trim() && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                                    <p className="text-sm text-destructive font-medium">
                                        AWB not found in Ready To Dispatch orders
                                    </p>
                                </div>
                            )}

                            {scanState === 'idle' && (
                                <p className="text-xs text-muted-foreground px-1">
                                    The input also works with a USB/Bluetooth HID barcode scanner.
                                </p>
                            )}
                        </div>

                        {/* Order line items preview */}
                        {matchedOrder && (
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                    Items in order
                                </Label>
                                <div className="rounded-lg border divide-y max-h-40 overflow-y-auto">
                                    {matchedOrder.raw.line_items?.map((item: any, i: number) => (
                                        <div key={i} className="flex justify-between items-center px-3 py-2 text-xs">
                                            <span className="truncate max-w-[65%]">{item.name}</span>
                                            <span className="text-muted-foreground shrink-0">×{item.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Upload progress */}
                        {isUploading && (
                            <div className="space-y-1.5">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Uploading video...
                                    </span>
                                    <span>{uploadProgress.toFixed(0)}%</span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-2">
                                    <div
                                        className="bg-primary h-2 rounded-full transition-all duration-200"
                                        style={{ width: `${uploadProgress}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ---- RIGHT: Camera + recording ---- */}
                    <div className="space-y-4">
                        <Label className="text-sm font-semibold flex items-center gap-1.5">
                            <Video className="h-4 w-4" />
                            Packaging Video
                        </Label>

                        {hasCameraPermission === false ? (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Camera Access Denied</AlertTitle>
                                <AlertDescription>
                                    Enable camera permissions in your browser to record packaging videos.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <div className="space-y-3">
                                {/* Live camera feed */}
                                <div
                                    className={cn(
                                        'bg-black rounded-xl overflow-hidden aspect-video relative',
                                        isRecording && 'ring-2 ring-red-500'
                                    )}
                                >
                                    <video
                                        ref={videoRef}
                                        className="w-full h-full object-cover"
                                        autoPlay
                                        muted
                                        playsInline
                                    />
                                    {/* Hidden canvas — same dimensions, used for recording */}
                                    <canvas ref={canvasRef} width={640} height={480} className="hidden" />
                                    {isRecording && (
                                        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                                            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                            REC {formatTime(recordingTime)}
                                            {recordingTime > 270 && (
                                                <span className="text-yellow-400 ml-1">({formatTime(300 - recordingTime)} left)</span>
                                            )}
                                        </div>
                                    )}
                                    {!streamReady && hasCameraPermission === null && (
                                        <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        </div>
                                    )}
                                </div>

                                {/* Recorded preview */}
                                {recordedBlob && !isRecording && (
                                    <div className="space-y-1.5">
                                        <p className="text-xs text-muted-foreground font-medium">Recorded preview:</p>
                                        <video
                                            src={URL.createObjectURL(recordedBlob)}
                                            controls
                                            className="w-full rounded-lg"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Size: {(recordedBlob.size / (1024 * 1024)).toFixed(2)} MB
                                        </p>
                                    </div>
                                )}

                                {/* Recording controls */}
                                <div className="flex gap-2">
                                    {!isRecording && !recordedBlob && (
                                        <Button
                                            className="flex-1"
                                            onClick={startRecording}
                                            disabled={!canRecord || !streamReady || isUploading}
                                        >
                                            <Camera className="h-4 w-4 mr-2" />
                                            {scanState !== 'found' ? 'Scan a valid AWB first' : 'Start Recording'}
                                        </Button>
                                    )}

                                    {isRecording && (
                                        <Button
                                            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                                            onClick={stopRecording}
                                        >
                                            <StopCircle className="h-4 w-4 mr-2" />
                                            Stop Recording ({formatTime(recordingTime)})
                                        </Button>
                                    )}

                                    {recordedBlob && !isRecording && (
                                        <>
                                            <Button
                                                variant="outline"
                                                className="flex-1"
                                                onClick={() => {
                                                    setRecordedBlob(null);
                                                    setRecordingTime(0);
                                                }}
                                                disabled={isUploading}
                                            >
                                                Re-record
                                            </Button>
                                            <Button
                                                className="flex-1"
                                                onClick={handleSaveVideo}
                                                disabled={!canSave || isUploading}
                                            >
                                                {isUploading ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        Saving...
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                                        Save & Mark Packed
                                                    </>
                                                )}
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}