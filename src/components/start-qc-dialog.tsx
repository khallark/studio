'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { storage, auth } from '@/lib/firebase';
import { ref, getDownloadURL, ref as storageRef, uploadBytesResumable } from 'firebase/storage';
import { Loader2, Camera, AlertTriangle } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import Image from 'next/image';
import { getReturnImageUrl } from '@/lib/storage-helpers';

type QcStatus = 'QC Pass' | 'QC Fail' | 'Not Received';

interface Order {
  id: string;
  name: string;
  booked_return_reason?: string;
  booked_return_images?: string[];
  returnItemsVariantIds?: (string | number)[];
  raw: {
    line_items: Array<{
      id: string | number;
      variant_id: string | number;
      title: string;
      quantity: number;
      sku: string | null;
      qc_status?: QcStatus;
    }>;
  };
}

interface StartQcDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  shopId: string;
  businessId: any;
}

const SHARED_STORE_ID = 'nfkjgp-sv.myshopify.com';

export function StartQcDialog({ isOpen, onClose, order, shopId, businessId }: StartQcDialogProps) {
  const [qcStatuses, setQcStatuses] = useState<Record<string | number, QcStatus | null>>({});
  const [customerImageUrls, setCustomerImageUrls] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const { toast } = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<Blob | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);

  const initialize = useCallback(() => {
    const initialStatuses: Record<string | number, QcStatus | null> = {};
    order.raw.line_items.forEach(item => {
      initialStatuses[item.id] = item.qc_status || null;
    });
    setQcStatuses(initialStatuses);
    setRecordedVideo(null);
    setUploadProgress(0);
    setRecordingTime(0);

    if (order.booked_return_images && order.booked_return_images.length > 0) {
    setLoadingImages(true);
    const fetchUrls = async () => {
      const urls = await Promise.all(
        order.booked_return_images!.map(async (imageName) => {
          try {
            // ✅ Try appropriate path based on store
            let imageRef;
            if (shopId === SHARED_STORE_ID) {
              imageRef = ref(storage, `return-images/shared/${shopId}/${order.id}/${imageName}`);
            } else {
              imageRef = ref(storage, `return-images/${businessId}/${shopId}/${order.id}/${imageName}`);
            }
            
            try {
              return await getDownloadURL(imageRef);
            } catch (err: any) {
              // Fallback to legacy path
              if (err.code === 'storage/object-not-found') {
                const legacyRef = ref(storage, `return-images/${shopId}/${order.id}/${imageName}`);
                return await getDownloadURL(legacyRef);
              }
              throw err;
            }
          } catch (error) {
            console.error(`Failed to get download URL for ${imageName}`, error);
            return null;
          }
        })
      );
      setCustomerImageUrls(urls.filter((url): url is string => url !== null));
      setLoadingImages(false);
    };
    fetchUrls();
  }
}, [order, shopId, businessId]);

  useEffect(() => {
    if (isOpen) {
      initialize();
    }
  }, [isOpen, initialize]);

  useEffect(() => {
    const getCameraPermission = async () => {
      if (!isOpen) return;
      try {
        // OPTIMIZED: Lower resolution and frame rate for faster uploads
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },      // Reduced from 1280
            height: { ideal: 480 },     // Reduced from 720
            frameRate: { ideal: 15 }    // Reduced from 24
          },
          audio: true
        });
        setHasCameraPermission(true);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Error accessing camera:', error);
        setHasCameraPermission(false);
      }
    };

    getCameraPermission();

    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    }
  }, [isOpen]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          if (newTime >= 180) {
            stopRecording();
            toast({
              title: 'Recording Complete',
              description: 'Maximum recording time reached (3 minutes).'
            });
          }
          return newTime;
        });
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleStatusChange = (itemId: string | number, status: QcStatus) => {
    setQcStatuses(prev => ({ ...prev, [itemId]: status }));
  };

  const startRecording = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;

      // OPTIMIZED: Much more aggressive compression for faster uploads
      const compressionOptions = [
        {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 400000,   // Reduced from 2000000 (400kbps)
          audioBitsPerSecond: 32000,    // Reduced from 128000 (32kbps)
        },
        {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 300000,   // Reduced from 1000000 (300kbps)
          audioBitsPerSecond: 32000,    // Reduced from 64000 (32kbps)
        },
        {
          mimeType: 'video/webm',
          videoBitsPerSecond: 400000,
          audioBitsPerSecond: 32000,
        },
      ];

      let mediaRecorder: MediaRecorder | null = null;

      for (const options of compressionOptions) {
        try {
          if (MediaRecorder.isTypeSupported(options.mimeType)) {
            mediaRecorder = new MediaRecorder(stream, options);
            console.log('Using compression:', options);
            break;
          }
        } catch (e) {
          console.log('Compression option not supported, trying next...');
        }
      }

      if (!mediaRecorder) {
        // Fallback with compression even without specific codec
        try {
          mediaRecorder = new MediaRecorder(stream, {
            videoBitsPerSecond: 400000,
            audioBitsPerSecond: 32000,
          });
          console.log('Using default compression with bitrate limits');
        } catch (e) {
          mediaRecorder = new MediaRecorder(stream);
          console.log('Using default compression without limits');
        }
      }

      mediaRecorderRef.current = mediaRecorder;

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        const sizeMB = blob.size / (1024 * 1024);
        console.log(`Recorded video size: ${sizeMB.toFixed(2)} MB`);
        setRecordedVideo(blob);
      };

      // OPTIMIZED: Request data in chunks for better memory management
      mediaRecorder.start(1000); // Get data every second
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (!recordedVideo) {
        throw new Error('Please record an unboxing video before submitting.');
      }

      const videoSizeMB = recordedVideo.size / (1024 * 1024);
      console.log(`Video size: ${videoSizeMB.toFixed(2)} MB`);

      // OPTIMIZED: Increased limit since videos are now much smaller
      if (videoSizeMB > 100) {
        throw new Error(`Video too large (${videoSizeMB.toFixed(1)}MB). Please record a shorter video.`);
      }

      toast({ title: 'Uploading video...', description: 'This may take a moment.' });

      const fileName = `unboxing_video_${Date.now()}.webm`;

      // ✅ Use appropriate path based on store
      let filePath: string;
      if (shopId === SHARED_STORE_ID) {
        filePath = `return-images/shared/${shopId}/${order.id}/${fileName}`;
      } else {
        filePath = `return-images/${businessId}/${shopId}/${order.id}/${fileName}`;
      }

      console.log(`Uploading QC video to: ${filePath}`);

      const videoStorageRef = storageRef(storage, filePath);

      const uploadTask = uploadBytesResumable(videoStorageRef, recordedVideo, {
        contentType: 'video/webm',
      });

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
          console.log(`Upload is ${progress.toFixed(1)}% done`);
        },
        (error) => {
          console.error('Upload error:', error);
          throw new Error(`Upload failed: ${error.message}`);
        }
      );

      await uploadTask;
      console.log('Video uploaded successfully to:', filePath);

      toast({ title: 'Video uploaded', description: 'Submitting QC data...' });

      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/shopify/orders/qc-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId,
          shop: shopId,
          orderId: order.id,
          qcStatuses,
          videoPath: filePath,
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        throw new Error('Server returned an error. Please try again.');
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Submission failed');
      }

      toast({ title: 'QC Submitted', description: 'The order is now pending refund.' });
      onClose();
    } catch (error) {
      console.error('QC submission error:', error);
      toast({
        title: 'Submission Failed',
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  const customerRequestedItems = order.returnItemsVariantIds
    ? order.raw.line_items.filter(li => order.returnItemsVariantIds!.includes(li.variant_id))
    : [];

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Start Quality Control for Order {order.name}</DialogTitle>
          <DialogDescription>
            Inspect the returned items and record the unboxing process.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] p-1">
          <div className="grid md:grid-cols-2 gap-6 py-4">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Item Statuses */}
              <section>
                <h3 className="font-semibold mb-3">1. Mark Item Status</h3>
                <div className="space-y-3 p-4 border rounded-md">
                  {order.raw.line_items.map(item => (
                    <div key={item.id} className="grid grid-cols-2 items-center gap-4">
                      <Label htmlFor={`qc-status-${item.id}`} className="truncate">
                        {item.title} (Qty: {item.quantity})
                      </Label>
                      <Select
                        value={qcStatuses[item.id] || ''}
                        onValueChange={(value: QcStatus) => handleStatusChange(item.id, value)}
                      >
                        <SelectTrigger id={`qc-status-${item.id}`}>
                          <SelectValue placeholder="Select status..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="QC Pass">QC Pass</SelectItem>
                          <SelectItem value="QC Fail">QC Fail</SelectItem>
                          <SelectItem value="Not Received">Not Received</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </section>

              {/* Customer Images */}
              <section>
                <h3 className="font-semibold mb-3">2. Customer Images</h3>
                {loadingImages ? (
                  <Loader2 className="animate-spin" />
                ) : order.booked_return_images && order.booked_return_images.length > 0 ? (
                  customerImageUrls.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {customerImageUrls.map((url, index) => (
                        <div key={index} className="relative aspect-square">
                          <Image src={url} alt={`Customer image ${index + 1}`} fill style={{ objectFit: 'cover' }} className="rounded-md" />
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Could not load customer images.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No customer images were provided for this return.</p>
                )}
              </section>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Reference Information */}
              <section className="space-y-4 text-sm text-muted-foreground">
                <h3 className="font-semibold text-foreground mb-2">2. Reference Information</h3>
                {customerRequestedItems.length > 0 ? (
                  <div>
                    <h4 className="font-medium">Customer Requested Items:</h4>
                    <ul className="list-disc list-inside">
                      {customerRequestedItems.map(item => <li key={item.id}>{item.title} (Qty: {item.quantity})</li>)}
                    </ul>
                  </div>
                ) : (
                  <p>This order was manually booked for return, so no customer-requested items can be shown.</p>
                )}
                {order.booked_return_reason && (
                  <div>
                    <h4 className="font-medium">Reason for Return:</h4>
                    <p>{order.booked_return_reason}</p>
                  </div>
                )}
              </section>

              {/* Video Recording */}
              <section>
                <h3 className="font-semibold mb-3">3. Record Unboxing Video</h3>
                {hasCameraPermission === false ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Camera Access Denied</AlertTitle>
                    <AlertDescription>
                      Please enable camera permissions in your browser to record a video.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-black rounded-md overflow-hidden aspect-video">
                      <video ref={videoRef} className="w-full h-full" autoPlay muted playsInline />
                    </div>

                    {isRecording && (
                      <div className="text-sm text-muted-foreground text-center">
                        Recording: {formatTime(recordingTime)}
                        {recordingTime > 150 && <span className="text-yellow-600 ml-2">(30 seconds remaining)</span>}
                      </div>
                    )}

                    {recordedVideo ? (
                      <div className="flex items-center gap-2">
                        <Button onClick={() => setRecordedVideo(null)} variant="outline" className="w-full">
                          Re-record Video
                        </Button>
                      </div>
                    ) : isRecording ? (
                      <Button onClick={stopRecording} className="w-full">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Stop Recording
                      </Button>
                    ) : (
                      <Button onClick={startRecording} className="w-full" disabled={!hasCameraPermission}>
                        <Camera className="mr-2 h-4 w-4" />
                        Start Recording
                      </Button>
                    )}
                    {recordedVideo && (
                      <div className="mt-4">
                        <h4 className="font-medium mb-2">Recorded Video Preview:</h4>
                        <video src={URL.createObjectURL(recordedVideo)} controls className="w-full rounded-md" />
                        <p className="text-sm text-muted-foreground mt-1">
                          Size: {(recordedVideo.size / (1024 * 1024)).toFixed(2)} MB
                          <span className="text-green-600 ml-2">✓ Optimized for fast upload</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="w-full mb-2">
              <div className="flex justify-between text-sm text-muted-foreground mb-1">
                <span>Uploading video...</span>
                <span>{uploadProgress.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || !recordedVideo}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit QC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}