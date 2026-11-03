// Shared helpers used by js/tool-shell.js

/**
 * Darkens everything outside the crop rectangle and outlines it.
 * The outline is drawn outside the crop so exported images stay clean.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {{x:number,y:number,w:number,h:number}|null} cropRect
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
    ctx.strokeRect(cropRect.x - 1, cropRect.y - 1, cropRect.w + 2, cropRect.h + 2);
    ctx.restore();
}

/**
 * Returns (and clears) an image passed from another tool via sessionStorage.
 * The sending side lives in tool-shell.js ("continue in Flyer Forge").
 * @returns {string|null} data URL
 */
function receiveImage() {
    try {
        const dataUrl = sessionStorage.getItem('pudrus_workflow_image');
        if (dataUrl) sessionStorage.removeItem('pudrus_workflow_image');
        return dataUrl;
    } catch (e) {
        return null;
    }
}
