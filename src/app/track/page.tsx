"use client";

import { useState, useEffect } from 'react';
import { AlertCircle, Package, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase-admin';

interface OrderData {
    awb?: string;
    awb_reverse?: string;
    courierProvider?: string;
    courierReverseProvider?: string;
}

interface QueryParams {
    shop: string | null;
    order: string | null;
}

type CourierProvider = 'Delhivery' | 'Xpressbees' | 'Shiprocket';

type Status = 'loading' | 'error';

export default function TrackingRedirect() {
    const [status, setStatus] = useState<Status>('loading');
    const [message, setMessage] = useState<string>('');

    useEffect(() => {
        handleTracking();
    }, []);

    const getQueryParams = (): QueryParams => {
        const params = new URLSearchParams(window.location.search);
        return {
            shop: params.get('shop'),
            order: params.get('order')
        };
    };

    const getCourierTrackingUrl = (courier: string, awb: string): string | null => {
        const courierMap: Record<CourierProvider, string> = {
            'Delhivery': `https://www.delhivery.com/track-v2/package/${awb}`,
            'Xpressbees': `https://www.xpressbees.com/shipment/tracking?awbNo=${awb}`,
            'Shiprocket': `https://shiprocket.co/tracking/${awb}`
        };

        return courierMap[courier as CourierProvider] || null;
    };

    const fetchOrderData = async (shopName: string, orderName: string): Promise<OrderData> => {
        try {
            if (!shopName || !orderName) {
                throw new Error('Invalid shop or order name');
            }
            const shopDoc = await db.collection('accounts').doc(shopName).get();
            if (!shopDoc.exists) {
                throw new Error('Shop not found');
            }
            const orderDoc = await shopDoc.ref.collection('orders').doc(orderName).get();
            if (!orderDoc.exists) {
                throw new Error('Order not found');
            }
            return orderDoc.data() as OrderData;
        } catch (error) {
            throw error;
        }
    };

    const handleTracking = async (): Promise<void> => {
        try {
            const { shop, order } = getQueryParams();

            // Validate required parameters
            if (!shop || !order) {
                setStatus('error');
                setMessage('Missing required parameters. Both shop and order are required.');
                return;
            }

            setMessage('Fetching order details...');

            // Fetch order data
            const orderData = await fetchOrderData(shop, order);

            if (!orderData) {
                setStatus('error');
                setMessage('Order not found');
                return;
            }

            // Determine AWB and courier provider
            let awb: string | null = null;
            let courierProvider: string | null = null;

            // Check for reverse AWB first, then regular AWB
            if (orderData.awb_reverse && orderData.courierReverseProvider) {
                awb = orderData.awb_reverse;
                courierProvider = orderData.courierReverseProvider;
            } else if (orderData.awb && orderData.courierProvider) {
                awb = orderData.awb;
                courierProvider = orderData.courierProvider;
            }

            // Validate AWB and courier provider
            if (!awb || !courierProvider) {
                setStatus('error');
                setMessage('Tracking information not available for this order. AWB or courier provider is missing.');
                return;
            }

            // Get tracking URL
            const trackingUrl = getCourierTrackingUrl(courierProvider, awb);

            if (!trackingUrl) {
                setStatus('error');
                setMessage(`Unsupported courier provider: ${courierProvider}`);
                return;
            }

            // Redirect
            setMessage(`Redirecting to ${courierProvider} tracking...`);
            window.location.href = trackingUrl;

        } catch (error) {
            setStatus('error');
            setMessage(error instanceof Error ? error.message : 'An error occurred while processing your request');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
                <div className="flex flex-col items-center text-center">
                    {status === 'loading' ? (
                        <>
                            <div className="mb-4 relative">
                                <Package className="w-16 h-16 text-indigo-600" />
                                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-800 mb-2">
                                Tracking Your Order
                            </h1>
                            <p className="text-gray-600 mb-4">{message}</p>
                            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                <div className="bg-indigo-600 h-2 rounded-full animate-pulse w-2/3"></div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="mb-4 p-4 bg-red-50 rounded-full">
                                <AlertCircle className="w-16 h-16 text-red-600" />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-800 mb-2">
                                Unable to Track Order
                            </h1>
                            <p className="text-gray-600 mb-6">{message}</p>
                            <button
                                onClick={() => window.history.back()}
                                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                                Go Back
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}