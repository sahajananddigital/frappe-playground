// ──────────────────────────────────────────────────────────────────────────────
// Frappe WASM Playground — Initialization Script
// ──────────────────────────────────────────────────────────────────────────────

async function initPlayground() {
    // 1. Register the Service Worker to intercept all network requests for routing to Python WSGI
    const swRegistration = await navigator.serviceWorker.register('/sw.js');
    if (!navigator.serviceWorker.controller) {
        // Wait until the service worker claims the client before proceeding
        await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve));
    }
    
    // 2. Spawn the Web Worker that runs the Pyodide Python Sandbox
    const pyWorker = new Worker('worker.js', { type: 'module' });
    
    // 3. Establish a direct MessageChannel for high-performance communication
    // This allows the Service Worker (Network layer) to send HTTP requests 
    // directly to the Web Worker (Python WSGI layer) bypassing the main thread.
    const channel = new MessageChannel();
    navigator.serviceWorker.controller.postMessage({ type: 'INIT_CHANNEL' }, [channel.port1]);
    pyWorker.postMessage({ type: 'INIT_CHANNEL' }, [channel.port2]);

    // 4. Listen for the Web Worker to finish its complex python bootstrap sequence
    pyWorker.onmessage = (e) => {
        if (e.data.type === 'READY') {
            // Remove the loading screen and load the Frappe Desk UI into the iframe
            document.getElementById('loading-screen').style.display = 'none';
            const deskIframe = document.getElementById('frappe-desk');
            deskIframe.src = '/app';
            deskIframe.style.display = 'block';
        }
    };
}

if ('serviceWorker' in navigator) { 
    window.addEventListener('load', initPlayground); 
}
