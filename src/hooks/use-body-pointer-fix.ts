// hooks/use-body-pointer-fix.ts
import { useEffect } from 'react';

/**
 * Fixes Radix UI bug where pointer-events: none gets stuck on body
 * after closing dialogs/sheets/popovers.
 * 
 * Add this hook once in your root layout or _app.tsx
 */
export function useBodyPointerFix() {
    useEffect(() => {
        // Create a MutationObserver to watch for style changes on body
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (
                    mutation.type === 'attributes' &&
                    mutation.attributeName === 'style'
                ) {
                    const body = document.body;
                    const hasPointerEventsNone = body.style.pointerEvents === 'none';

                    // Check if any Radix portals are actually open
                    const hasOpenPortal = document.querySelector(
                        '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-radix-popper-content-wrapper]'
                    );

                    // If pointer-events is none but no dialog is open, fix it
                    if (hasPointerEventsNone && !hasOpenPortal) {
                        // Small delay to let animations complete
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

        // Also run a periodic check as a fallback
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
}