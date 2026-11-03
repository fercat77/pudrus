// Shared utility functions for all tools

/**
 * Draws a semi-transparent overlay to indicate crop area
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Object|null} cropRect - Crop rectangle {x, y, w, h} or null
 */
function drawCropOverlay(ctx, canvas, cropRect) {
    if (!cropRect) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, cropRect.x, canvas.height);
    ctx.fillRect(cropRect.x + cropRect.w, 0, canvas.width - (cropRect.x + cropRect.w), canvas.height);
    ctx.fillRect(cropRect.x, 0, cropRect.w, cropRect.y);
    ctx.fillRect(cropRect.x, cropRect.y + cropRect.h, cropRect.w, canvas.height - (cropRect.y + cropRect.h));
    ctx.strokeStyle = 'rgba(89,255,0,0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(cropRect.x - 1, cropRect.y - 1, cropRect.w + 2, cropRect.h + 2); // outside the crop so exports stay clean
    ctx.restore();
}

/**
 * Calculates crop rectangle based on aspect ratio and offsets
 * @param {number} W - Canvas width
 * @param {number} H - Canvas height
 * @param {string} ratio - Aspect ratio ('free', '1:1', '4:5', '9:16')
 * @param {HTMLInputElement} offsetXSlider - Offset X slider element
 * @param {HTMLInputElement} offsetYSlider - Offset Y slider element
 * @returns {Object|null} Crop rectangle {x, y, w, h} or null for free ratio
 */
function calculateCropRect(W, H, ratio, offsetXSlider, offsetYSlider) {
    if (ratio === 'free') {
        if (offsetXSlider) {
            offsetXSlider.disabled = true;
            offsetYSlider.disabled = true;
        }
        return null;
    }

    if (offsetXSlider) {
        offsetXSlider.disabled = false;
        offsetYSlider.disabled = false;
    }

    const [w, h] = ratio.split(':').map(Number);
    const targetRatio = w / h;
    const currentRatio = W / H;
    let cropW, cropH, cropX, cropY;

    if (currentRatio > targetRatio) {
        cropH = H;
        cropW = H * targetRatio;
        cropX = (W - cropW) / 2 * (1 + (offsetXSlider ? offsetXSlider.value / 50 : 0));
        cropY = 0;
    } else {
        cropW = W;
        cropH = W / targetRatio;
        cropX = 0;
        cropY = (H - cropH) / 2 * (1 + (offsetYSlider ? offsetYSlider.value / 50 : 0));
    }

    return { x: cropX, y: cropY, w: cropW, h: cropH };
}

/**
 * Sets up crop functionality with aspect ratio and offset controls
 * @param {number} W - Canvas width
 * @param {number} H - Canvas height
 * @param {Function} onCropChange - Callback function when crop changes
 * @returns {Object} Object with updateCropRect function and cropRect property
 */
function setupCropControls(W, H, onCropChange) {
    const aspectRatioSelect = document.getElementById('aspectRatio');
    const offsetXSlider = document.getElementById('cropOffsetX');
    const offsetYSlider = document.getElementById('cropOffsetY');
    let cropRect = null;

    function updateCropRect() {
        const ratio = aspectRatioSelect.value;
        cropRect = calculateCropRect(W, H, ratio, offsetXSlider, offsetYSlider);
        if (onCropChange) onCropChange(cropRect);
    }

    // Note: Event listeners are NOT added here to avoid conflicts
    // The caller should manually call updateCropRect() when needed

    // Initial calculation
    updateCropRect();

    return {
        get cropRect() { return cropRect; },
        updateCropRect,
        setSize(W, H) {
            updateCropRect();
        }
    };
}

/**
 * Loads an image file and prepares it on canvas
 * @param {File|string} file - File object or data URL string
 * @param {HTMLCanvasElement} canvas - Target canvas element
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {HTMLElement} canvasArea - Canvas area container
 * @param {HTMLElement} canvasInfo - Canvas info element
 * @param {HTMLElement} fileUpload - File upload element (optional)
 * @returns {Promise<Object>} Image data object with img, width, height
 */
function loadImageFile(file, canvas, ctx, canvasArea, canvasInfo, fileUpload) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
            const area = canvasArea;
            const maxW = area.clientWidth - 40;
            const maxH = area.clientHeight - 40;
            const scale = Math.min(maxW / img.width, maxH / img.height, 1);
            
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.style.width = (img.width * scale) + 'px';
            canvas.style.height = (img.height * scale) + 'px';
            ctx.drawImage(img, 0, 0);
            
            const imageData = {
                img,
                width: img.width,
                height: img.height,
                data: ctx.getImageData(0, 0, canvas.width, canvas.height)
            };
            
            if (canvasInfo) {
                canvasInfo.textContent = `${img.width} × ${img.height} px`;
                canvasInfo.style.display = 'block';
            }
            
            if (canvasArea) {
                canvasArea.classList.add('has-image');
            }
            
            if (fileUpload) {
                fileUpload.style.display = 'none';
            }
            
            resolve(imageData);
        };

        img.onerror = () => {
            reject(new Error('Failed to load image'));
        };

        if (typeof file === 'string') {
            img.src = file; // It's already a data URL
        } else {
            const reader = new FileReader();
            reader.onload = e => { img.src = e.target.result; };
            reader.readAsDataURL(file);
        }
    });
}

/**
 * Exports canvas content to PNG file
 * @param {HTMLCanvasElement} canvas - Source canvas
 * @param {Object|null} cropRect - Crop rectangle or null
 * @param {string} filename - Output filename
 * @param {number} maxDim - Maximum dimension (optional)
 */
function exportToPNG(canvas, cropRect, filename = 'pudrus_export', maxDim = null) {
    let sx = cropRect ? cropRect.x : 0;
    let sy = cropRect ? cropRect.y : 0;
    let sWidth = cropRect ? cropRect.w : canvas.width;
    let sHeight = cropRect ? cropRect.h : canvas.height;

    let exportCanvas = document.createElement('canvas');
    let exportCtx = exportCanvas.getContext('2d');

    if (maxDim) {
        const scale = Math.min(1, maxDim / Math.max(sWidth, sHeight));
        exportCanvas.width = Math.floor(sWidth * scale);
        exportCanvas.height = Math.floor(sHeight * scale);
        exportCtx.drawImage(canvas, sx, sy, sWidth, sHeight, 0, 0, exportCanvas.width, exportCanvas.height);
    } else {
        exportCanvas.width = sWidth;
        exportCanvas.height = sHeight;
        exportCtx.drawImage(canvas, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
    }

    const link = document.createElement('a');
    link.download = `${filename}_${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
}

// --- WORKFLOW (pass an image between tools) ---
const WORKFLOW_STORAGE_KEY = 'pudrus_workflow_image';

function sendTo(toolUrl, canvasElement, cropRect) {
    if (!canvasElement) {
        console.error('Workflow Error: Canvas element not provided.');
        return;
    }
    const exportCanvas = document.createElement('canvas');
    const exportCtx = exportCanvas.getContext('2d');

    const sx = cropRect ? cropRect.x : 0;
    const sy = cropRect ? cropRect.y : 0;
    const sWidth = cropRect ? cropRect.w : canvasElement.width;
    const sHeight = cropRect ? cropRect.h : canvasElement.height;

    exportCanvas.width = sWidth;
    exportCanvas.height = sHeight;

    exportCtx.drawImage(canvasElement, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
    sessionStorage.setItem(WORKFLOW_STORAGE_KEY, exportCanvas.toDataURL('image/png'));
    window.location.href = `../${toolUrl}/index.html`;
}

function receiveImage() {
    const dataUrl = sessionStorage.getItem(WORKFLOW_STORAGE_KEY);
    if (dataUrl) {
        sessionStorage.removeItem(WORKFLOW_STORAGE_KEY); // Clear after reading
        return dataUrl;
    }
    return null;
}
