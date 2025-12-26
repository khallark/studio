// components/body-pointer-fix-provider.tsx
'use client';

import { useEffect } from 'react';

export function BodyPointerFixProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (
                    mutation.type === 'attributes' &&
                    mutation.attributeName === 'style'
                ) {
                    const body = document.body;
                    const hasPointerEventsNone = body.style.pointerEvents === 'none';
                    
                    const hasOpenPortal = document.querySelector(
                        '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-radix-popper-content-wrapper]'
                    );
                    
                    if (hasPointerEventsNone && !hasOpenPortal) {
                        setTimeout(() => {
                            const stillHasOpenPortal = document.querySelector(
                                '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-radix-popper-content-wrapper]'
                            );
                            
                            if (!stillHasOpenPortal) {
                                body.style.pointerEvents = '';
                            }
                        }, 100);
                    }
                }
            });
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['style'],
        });

        const intervalId = setInterval(() => {
            const body = document.body;
            if (body.style.pointerEvents === 'none') {
                const hasOpenPortal = document.querySelector(
                    '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-radix-popper-content-wrapper]'
                );
                
                if (!hasOpenPortal) {
                    body.style.pointerEvents = '';
                }
            }
        }, 500);

        return () => {
            observer.disconnect();
            clearInterval(intervalId);
        };
    }, []);

    return <>{children}</>;
}