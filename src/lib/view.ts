import Pickr from "@simonwep/pickr";
import {
    Border,
    Color,
    Move,
    Quilt,
    Rect,
    RectBounds,
    RenderData,
    Sashes,
    SashInfo,
} from "./model";
import { TabGroup } from "./tabs";

export enum Tool {
    Paint,
    SpinR,
    FlipH,
    SpinL,
    FlipV,
}

export enum Click {
    Ignore,
    Allow,
}

/**
 * Last rendered view information, for optimizing updates in Previewer.
 */
class ViewData {
    editorState: number = -1;
    layout: string = "N/A";
    quilt: Quilt = new Quilt();
}

function clamp(n: number, lo?: number, hi?: number): number {
    const top = typeof hi === "number" ? Math.min(n, hi) : n;

    return typeof lo === "number" ? Math.max(lo, top) : top;
}

function arrayEquals(a: any[], b: any[]): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }

    return true;
}

function deepCopy<T>(x: T): T {
    return JSON.parse(JSON.stringify(x));
}

/**
 * Get the effective pixel ratio of a canvas after sizeCanvasTo()
 * @param canvas Canvas that has been resized
 * @param size Logical size of the canvas
 * @return Device pixel ratio (float, probably >=1.0)
 */
function getDPR(canvas: HTMLCanvasElement, size: Rect): number {
    // device-space width ÷ logical width
    return size.w ? canvas.width / size.w : 1;
}

/**
 * Resize a canvas to a specific physical and logical size.
 * @param canvas Canvas to resize
 * @param size Logical size (CSS pixels) to resize to
 * @param ignoreDPR TRUE to ignore the device pixel ratio (for downloads)
 */
export function sizeCanvasTo(canvas: HTMLCanvasElement, size: Rect, ignoreDPR?: boolean) {
    const DPR = ignoreDPR ? 1 : Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = size.w * DPR;
    canvas.height = size.h * DPR;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
}

/**
 * Draw/update a quilt into a canvas.
 */
export class Previewer {
    ignoreDPR: boolean = false;
    private readonly maxSize: RectBounds;
    private readonly minSize: RectBounds;
    private readonly canvas: HTMLCanvasElement;
    private readonly view: ViewData;

    constructor(canvas: HTMLCanvasElement, maxSize: RectBounds, minSize: RectBounds) {
        this.canvas = canvas;
        this.maxSize = maxSize;
        this.minSize = minSize;
        this.view = new ViewData();
        // set this.drawSize
        this.resizeToBounds(new Rect(canvas.width, canvas.height));
    }

    private _drawSize: Rect; // public-read-only with get drawSize()

    get drawSize(): Rect {
        return this._drawSize;
    }

    resizeToBounds(available: Rect, aspect?: number, quantum: number = 1): Rect {
        aspect ??= available.w / available.h;
        const quantumW = Math.max(1, Math.floor(quantum * aspect));
        const limit = new Rect(
            clamp(available.w, this.minSize.w, this.maxSize.w) | 0,
            clamp(available.h, this.minSize.h, this.maxSize.h) | 0,
        );

        // first, quantize the available dimensions
        let w = limit.w - (limit.w % quantumW),
            h = limit.h - (limit.h % quantum);
        const tmpAspect = w / h;

        // reduce the resulting width/height to attain the desired aspect ratio
        if (tmpAspect > aspect) {
            w = h * aspect;
        } else if (tmpAspect < aspect) {
            h = w / aspect;
        }

        // expand back to the minima if necessary (minSize beats maxSize)
        if (w < (this.minSize.w ?? -1)) {
            w = this.minSize.w;
            h = this.minSize.w / aspect;
        }
        if (h < (this.minSize.h ?? -1)) {
            w = this.minSize.h * aspect;
            h = this.minSize.h;
        }

        // set the draw dimensions we just calculated
        return (this._drawSize = new Rect(Math.round(w), Math.round(h)));
    }

    render(r: RenderData, seq?: number) {
        // extract some information we will reference a lot
        const v = this.view,
            cellSize = r.cellSize,
            quilt = r.quilt,
            visQuilt = v.quilt, // visible quilt on-screen
            sash = quilt.sash;

        // resize the canvas to the draw dimensions if needed
        const layout = `${cellSize},${r.cells},${r.hasSash ? "sash" : "noSash"}`;
        let fullRedraw = layout !== v.layout || v.editorState < 0 || typeof seq !== "number";
        if (fullRedraw) {
            v.layout = layout;
            sizeCanvasTo(this.canvas, r.canvasSize, this.ignoreDPR);
            // reset "last drawn" to an empty quilt, so that we redraw everything
            v.quilt = new Quilt();
        } else if (
            !v.quilt.colorSet.equals(quilt.colorSet) ||
            (r.hasSash && !arrayEquals(v.quilt.sash.colors, quilt.sash.colors))
        ) {
            // if the palette has changed, redraw everything, but without resizing
            fullRedraw = true;
        }

        // start drawing
        const ctx = this.canvas.getContext("2d", { alpha: false });
        ctx.save();

        // DPR is ignored if this is for creating the download image
        const DPR = this.ignoreDPR ? 1 : getDPR(this.canvas, r.canvasSize);
        ctx.scale(DPR, DPR);

        // draw changes to borders
        this.drawBorders(fullRedraw ? undefined : visQuilt.borders, ctx, r);
        visQuilt.borders = deepCopy(quilt.borders);

        // draw main sashing, if applicable
        if (r.hasSash) {
            this.drawSash(fullRedraw ? null : visQuilt.sash, ctx, sash, r);
            visQuilt.sash = deepCopy(sash);
        } else if (visQuilt.sash.levels !== Sashes.None) {
            visQuilt.sash = new SashInfo();
        }

        // draw the 5x4 blocks, inset by the half-border-width padSize, and offset
        // by sashing if specified
        if (fullRedraw || seq !== v.editorState) {
            this.drawBlocks(ctx, r);
            v.editorState = seq;
        }

        ctx.restore();
    }

    private drawBorders(
        prior: Array<Border> | undefined,
        ctx: CanvasRenderingContext2D,
        r: RenderData,
    ) {
        const quilt = r.quilt;
        let oX = 0;
        let oY = 0;
        let w = r.canvasSize.w;
        let h = r.canvasSize.h;

        const borders = quilt.borders;
        for (let i = 0; i < borders.length; i++) {
            const border = borders[i];
            const viewBorder = prior && i < prior.length ? prior[i] : null;

            // skip everything if this border is not visible
            if (border.cellWidth === 0) {
                continue;
            }

            // determine the border sizes
            const delta = border.cellWidth * r.cellSize; // full border space
            const strip = delta / 2; // space of one strip of the border

            // if this is a full redraw or the border has changed, repaint it
            if (!border.equals(viewBorder)) {
                // draw an outer edge, then inner edge, then fill even-odd so that
                // only the actual border pixels get painted. overdraws vastly
                // fewer pixels than our old fillRect() code.
                ctx.beginPath();
                ctx.rect(oX, oY, w, h);
                ctx.rect(oX + strip, oY + strip, w - delta, h - delta);
                ctx.closePath();

                ctx.fillStyle = border.color;
                ctx.fill("evenodd");
            }

            // adjust next drawing area
            oX += strip;
            oY += strip;
            w -= delta;
            h -= delta;
        }
    }

    private drawSash(
        prior: SashInfo | undefined,
        ctx: CanvasRenderingContext2D,
        sash: SashInfo,
        r: RenderData,
    ) {
        if (sash.levels === Sashes.None) {
            return;
        }

        const sashSpacing = r.cellSize;
        const blockSize = r.blockSize;
        const padSize = r.padSize;
        const borderSize = 2 * padSize;
        const viewColors = prior && prior.levels === sash.levels ? prior.colors : ([] as Color[]);
        const drawMain = !(prior && viewColors && viewColors[0] === sash.colors[0]);
        const stepSize = blockSize + sashSpacing;
        const padStepSize = padSize + stepSize;
        const shape = r.quilt.shape;

        // draw main sashing
        if (drawMain) {
            ctx.fillStyle = sash.colors[0];
            for (let col = 1, oX = padStepSize; col < shape.w; col++) {
                ctx.fillRect(oX - sashSpacing, padSize, sashSpacing, r.canvasSize.h - borderSize);
                oX += stepSize;
            }
            for (let row = 1, oY = padStepSize; row < shape.h; row++) {
                ctx.fillRect(padSize, oY - sashSpacing, r.canvasSize.w - borderSize, sashSpacing);
                oY += stepSize;
            }
        }

        // draw cross sashing, if applicable
        if (sash.levels !== Sashes.Double) {
            return;
        } else if (!drawMain && viewColors.length >= 2 && viewColors[1] === sash.colors[1]) {
            // cross sashing neither changed nor drawn over
            return;
        }
        ctx.fillStyle = sash.colors[1];
        for (let col = 1, oX = padStepSize; col < shape.w; col++) {
            for (let row = 1, oY = padStepSize; row < shape.h; row++) {
                // draw cross sash: above left of current point
                ctx.fillRect(oX - sashSpacing, oY - sashSpacing, sashSpacing, sashSpacing);
                oY += stepSize;
            }
            oX += stepSize;
        }
    }

    private drawBlocks(ctx: CanvasRenderingContext2D, r: RenderData) {
        // parse render data
        const blockSize = r.blockSize;
        const padSize = r.padSize;
        const sashSize = r.hasSash ? r.cellSize : 0;
        const q = r.quilt;
        const shape = q.shape;

        // pre-scale all blocks on the quilt
        const sourceCount: number = q.blocks.length;
        const scaled: CanvasImageSource[] = new Array(sourceCount);
        for (let i = 0; i < sourceCount; i++) {
            scaled[i] = q.blocks[i].getScaledSource(r.blockSize);
        }

        // draw from the pre-scaled images
        const stepSize = blockSize + sashSize; // common subexpression
        let iBlock = 0;
        for (let row = 0, oY = padSize; row < shape.h; row++) {
            for (let col = 0, oX = padSize; col < shape.w; col++) {
                ctx.drawImage(scaled[q.blockMap[iBlock++]], oX, oY);
                oX += stepSize; // next column
            }
            oY += stepSize; // next row
        }
    }
}

export class UI {
    /** currently selected block index */
    editorBlock: number = 0;
    /** generation of the editor, incremented on changes */
    editorState: number = 0;
    /** editor cell size in pixels (width & height) */
    cellPx: number = 0;
    /** tabs (editor/preview) */
    tabs: TabGroup | null = null;
    /** whether clicks on Pickr elements should be passed into Pickr */
    colorEvents: Click = Click.Allow;
    /** HTML template for new colors */
    colorTemplate: HTMLTemplateElement | null = null;
    /** HTML template for new borders */
    borderTemplate: HTMLTemplateElement | null = null;
    /** Current guide color, shown between squares in the block editor */
    guideColor: string = "";
    /** Primary and secondary paint colors */
    paintColors: [number, number] = [1, 0];
    /** Currently active tool ID */
    selectedTool: Tool = Tool.Paint;
    /** Whether the selectedTool handles mousemove gracefully (Move.ALLOW) */
    moveStatus: Move = Move.Allow;
}

export class PickrHandle {
    constructor(
        public handle: Pickr,
        public saved: Color,
    ) {}

    /**
     * Save the selected color to the picker, for use on the next reset event.
     *
     * Typically called when Pickr is popped down, by clicking outside of it.
     *
     * @param newColor Color that has been selected
     */
    saveColor(newColor: Color) {
        this.saved = newColor; // remember the color for Reset
        this.handle.applyColor(true); // apply without firing the event
    }
}
