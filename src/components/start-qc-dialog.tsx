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
import { storage, auth } from '@/lib/firebase'; // Only need auth now
import { ref, getDownloadURL } from 'firebase/storage';
import { Loader2, Camera, AlertTriangle } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import Image from 'next/image';

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
  user: any; // Firebase user object
  onStatusUpdate: (orderId: string, status: any) => Promise<void>;
}

export function StartQcDialog({ isOpen, onClose, order, shopId, user, onStatusUpdate }: StartQcDialogProps) {
  const [qcStatuses, setQcStatuses] = useState<Record<string | number, QcStatus | null>>({});
  const [customerImageUrls, setCustomerImageUrls] = useState<string[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState<Blob | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);

  const initialize = useCallback(() => {
    // Initialize QC statuses from order data if available
    const initialStatuses: Record<string | number, QcStatus | null> = {};
    order.raw.line_items.forEach(item => {
      initialStatuses[item.id] = item.qc_status || null;
    });
    setQcStatuses(initialStatuses);
    setRecordedVideo(null);

    // Fetch customer-uploaded images
    if (order.booked_return_images && order.booked_return_images.length > 0) {
      setLoadingImages(true);
      const fetchUrls = async () => {
        const urls = await Promise.all(
          order.booked_return_images!.map(async (imageName) => {
            try {
              const imageRef = ref(storage, `/return-images/${shopId}/${order.id}/${imageName}`);
              return await getDownloadURL(imageRef);
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
    } else {
      setLoadingImages(false);
    }
  }, [order, shopId]);

  useEffect(() => {
    if (isOpen) {
      initialize();
    }
  }, [isOpen, initialize]);

  useEffect(() => {
    const getCameraPermission = async () => {
      if (!isOpen) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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

  const handleStatusChange = (itemId: string | number, status: QcStatus) => {
    setQcStatuses(prev => ({ ...prev, [itemId]: status }));
  };

  const startRecording = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      mediaRecorderRef.current.ondataavailable = (event) => {
        chunks.push(event.data);
      };
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        setRecordedVideo(blob);
      };
      mediaRecorderRef.current.start();
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

      toast({ title: 'Uploading video...', description: 'Please wait.' });

      // Prepare form data
      const formData = new FormData();
      formData.append('video', recordedVideo);
      formData.append('shopId', shopId);
      formData.append('orderId', order.id);
      formData.append('qcStatuses', JSON.stringify(qcStatuses));

      // Get auth token
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // Call API
      const response = await fetch('/api/shopify/orders/qc-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Submission failed');
      }

      toast({ title: 'QC Submitted', description: 'The order is now pending refund.' });
      onClose();
      
      // Refresh the order list or trigger any necessary updates
      if (onStatusUpdate) {
        await onStatusUpdate(order.id, 'Pending Refunds');
      }
    } catch (error) {
      console.error('QC submission error:', error);
      toast({ 
        title: 'Submission Failed', 
        description: error instanceof Error ? error.message : 'An unknown error occurred', 
        variant: 'destructive' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const customerRequestedItems = order.returnItemsVariantIds
    ? order.raw.line_items.filter(li => order.returnItemsVariantIds!.includes(li.variant_id))
    : [];

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

              {/* Reference Information */}
              <section className="space-y-4 text-sm text-muted-foreground">
                  <h3 className="font-semibold text-foreground mb-2">Reference Information</h3>
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
            </div>

            {/* Right Column */}
            <div className="space-y-6">
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
                    </div>
                  )}
                </div>
                 )}
              </section>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
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