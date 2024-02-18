import {
    BlockInfo,
    Border,
    Color,
    Guide,
    GuideType,
    Palette,
    Quilt,
    Rect,
    RectBounds,
    Sashes,
    SashInfo
} from "./model";

/**
 * Last rendered view information, for optimizing updates in Previewer.
 */
class ViewData {
    editorState: number = -1;
    layout: string = "N/A";
    quilt: Quilt = new Quilt();
}

class RenderData {
    /** Width of the border, in cell halves */
    readonly borderUnits: number;
    /** Whether the sashing should be displayed at all */
    readonly hasSash: boolean;
    /** Total width/height of the quilt, in cells */
    readonly cells: Rect;

    /**
     * Number of pixels of a single cell, determined by callback
     *
     * This is also the width and height of the sashing (1 cell.)
     */
    readonly cellSize: number;
    /** Per-edge border width, in pixels */
    readonly padSize: number;
    /** Width (= height) of a single quilt block, in pixels */
    readonly blockSize: number;
    /** Size of the entire canvas, in pixels */
    readonly canvasSize: Rect;

    constructor(quilt: Quilt, cellSizeFn: (cells: Rect) => number) {
        const shape = quilt.shape;
        const blockCells = quilt.blockCells;

        this.hasSash = quilt.sash.levels !== Sashes.None;

        // sum up the border sizes to get the total border units
        let borderUnits = 0;
        for (const border of quilt.borders) {
            borderUnits += border.cellWidth;
        }
        this.borderUnits = borderUnits;

        // "Border units" is in half-cells, so figure out the pixel size based on blockSize.
        // Determine the number of cells horizontally and vertically.  This is determining the total
        // border: borderUnits=1 means 1/2 cell * 2 sides.  Sashing goes between blocks only, and it
        // is a fixed 1-cell width for the moment.  Thus, it adds blocks-1 cells to each dimension
        // when present.
        this.cells = new Rect(
            blockCells * shape.w + borderUnits + (this.hasSash ? shape.w - 1 : 0),
            blockCells * shape.h + borderUnits + (this.hasSash ? shape.h - 1 : 0),
        );

        // okay, now that we have cell dimensions, call the cellSizeFn to get pixel information
        this.cellSize = cellSizeFn(this.cells);
        this.padSize = (this.cellSize * this.borderUnits) / 2; // half on each side
        this.blockSize = this.cellSize * blockCells;

        // calculate pixel dimensions, as px/cell * cells
        this.canvasSize = this.cells.scale(this.cellSize);
    }
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
function sizeCanvasTo(canvas: HTMLCanvasElement, size: Rect, ignoreDPR: boolean = false) {
    const DPR = ignoreDPR ? 1 : Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = size.w * DPR;
    canvas.height = size.h * DPR;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
}

function getDrawSize(
    available: Rect,
    maxSize: RectBounds,
    minSize: RectBounds,
    quantum: number,
    aspect?: number,
) {
    aspect ??= available.w / available.h;
    const quantumW = Math.max(1, Math.floor(quantum * aspect));
    const limit = new Rect(
        clamp(available.w, minSize.w, maxSize.w) | 0,
        clamp(available.h, minSize.h, maxSize.h) | 0,
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
    if (w < (minSize.w ?? -1)) {
        w = minSize.w;
        h = minSize.w / aspect;
    }
    if (h < (minSize.h ?? -1)) {
        w = minSize.h * aspect;
        h = minSize.h;
    }

    // we now have the final dimensions
    return new Rect(Math.round(w), Math.round(h));
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

    resizeToBounds(available: Rect, aspect?: number, quantum: number = 1) {
        this._drawSize = getDrawSize(available, this.maxSize, this.minSize, quantum, aspect);
    }

    render(quilt: Quilt, sizeFn: (cells: Rect) => number, seq?: number) {
        // extract some information we will reference a lot
        const r = new RenderData(quilt, sizeFn),
            v = this.view,
            cellSize = r.cellSize,
            visQuilt = v.quilt, // visible quilt on-screen
            sash = quilt.sash;

        // resize the canvas to the draw dimensions if needed
        const layout = `${cellSize},${r.cells},${r.hasSash ? "sash" : "noSash"}`;
        console.log(`${this.canvas.id} render layout: ${layout}`);
        let fullRedraw = layout !== v.layout || v.editorState < 0 || typeof seq !== "number";
        if (fullRedraw) {
            v.layout = layout;
            sizeCanvasTo(this.canvas, r.canvasSize, this.ignoreDPR);
            // reset "last drawn" to an empty quilt, so that we redraw everything
            v.quilt = new Quilt(quilt.shape);
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
        this.drawBorders(fullRedraw ? undefined : visQuilt.borders, quilt.borders, ctx, r);
        v.quilt.borders = deepCopy(quilt.borders);

        // draw main sashing, if applicable
        if (r.hasSash) {
            this.drawSash(fullRedraw ? null : visQuilt.sash, sash, quilt.shape, ctx, r);
            v.quilt.sash = deepCopy(sash);
        } else if (visQuilt.sash.levels !== Sashes.None) {
            v.quilt.sash = new SashInfo();
        }

        // draw the 5x4 blocks, inset by the half-border-width padSize, and offset
        // by sashing if specified
        if (fullRedraw || seq !== v.editorState) {
            this.drawBlocks(quilt, ctx, r);
            v.editorState = seq;
            v.quilt.colorSet = quilt.colorSet.copy();
        }

        ctx.restore();
    }

    private drawBorders(
        prior: Array<Border> | undefined,
        borders: Array<Border>,
        ctx: CanvasRenderingContext2D,
        r: RenderData,
    ) {
        let oX = 0;
        let oY = 0;
        let w = r.canvasSize.w;
        let h = r.canvasSize.h;
        let drawRest = false;

        for (let i = 0; i < borders.length; i++) {
            const border = borders[i];
            const viewBorder = prior && i < prior.length ? prior[i] : null;

            // skip everything if this border is (still) not visible
            if (border.cellWidth === 0 && (viewBorder?.cellWidth || 0) === 0) {
                continue;
            }

            // determine the border sizes
            const delta = border.cellWidth * r.cellSize; // full border space
            const strip = delta / 2; // space of one strip of the border

            // if this is a full redraw or the border has changed, repaint it
            if (drawRest || !border.equals(viewBorder)) {
                // draw an outer edge, then inner edge, then fill even-odd so that
                // only the actual border pixels get painted. overdraws vastly
                // fewer pixels than our old fillRect() code.
                ctx.beginPath();
                ctx.rect(oX, oY, w, h);
                ctx.rect(oX + strip, oY + strip, w - delta, h - delta);
                ctx.closePath();

                ctx.fillStyle = border.color;
                ctx.fill("evenodd");

                if (!drawRest && border.cellWidth !== viewBorder?.cellWidth) {
                    drawRest = true; // if the size changed, redraw everything inside
                }
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
        sash: SashInfo,
        shape: Rect,
        ctx: CanvasRenderingContext2D,
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

    private drawBlocks(q: Quilt, ctx: CanvasRenderingContext2D, r: RenderData) {
        // parse render data
        const blockSize = r.blockSize;
        const padSize = r.padSize;
        const sashSize = r.hasSash ? r.cellSize : 0;

        // pre-scale all blocks on the quilt
        const sourceCount: number = q.blocks.length;
        const scaled: CanvasImageSource[] = new Array(sourceCount);
        for (let i = 0; i < sourceCount; i++) {
            scaled[i] = q.blocks[i].getScaledSource(r.blockSize);
        }

        // draw from the pre-scaled images
        const stepSize = blockSize + sashSize; // common subexpression
        let oY = padSize; // initial row(oY)/column(oX) offsets
        let oX = padSize;
        for (const rowMap of q) {
            for (const iBlock of rowMap) {
                ctx.drawImage(scaled[iBlock], oX, oY);
                oX += stepSize; // next column
            }
            oY += stepSize; // next row
            oX = padSize; // reset to first column
        }
    }
}

/**
 * Current block view in the editor, and overlay canvas
 */
export class BlockEditor {
    /** currently selected block index (not yet changeable/usable) */
    private _current: number = 0;
    /** cell size during the most recent render() call */
    private lastCellPx: number = -1;
    /** most recent guide types drawn by render() */
    private lastGuides: Guide;
    private lastColors: Palette;
    private readonly maxSize: RectBounds;
    private readonly minSize: RectBounds;
    private readonly _canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement, maxWidth: number, minWidth: number) {
        this._canvas = canvas;
        this._width = canvas.width;
        // the block is always square
        this.maxSize = new Rect(maxWidth, maxWidth);
        this.minSize = new Rect(minWidth, minWidth);

        // last drawn: nothing
        this.lastGuides = new Guide("");
        this.lastColors = new Palette();
    }

    /** generation of the editor, incremented on changes */
    private _state: number = 0;

    get state(): number {
        return this._state;
    }

    /** current canvas size (w/h) */
    private _width: number = 0;

    get width(): number {
        return this._width;
    }

    get currentBlock(): number {
        return this._current;
    }

    get canvas(): HTMLCanvasElement {
        return this._canvas;
    }

    resizeToBounds(width: number, height: number) {
        const draw = getDrawSize(new Rect(width, height), this.maxSize, this.minSize, 12);
        this._width = Math.min(draw.w, draw.h, this.maxSize.w);
    }

    render(quilt: Quilt, guides: Guide) {
        const colors = quilt.colorSet,
            block = quilt.blocks[this._current],
            editor = this._canvas;

        // render the current blockInfo into the editor canvas
        const cellCount = block.getSize();
        let dirty = block.isDirty();

        // Resize editor if needed, assuming square
        const cW = 2 * Math.floor(this._width / cellCount / 2);
        const pixelSize = cW * cellCount;
        if (cW !== this.lastCellPx || editor.style.width === "") {
            this.lastCellPx = cW;
            sizeCanvasTo(editor, new Rect(pixelSize, pixelSize));
            dirty = true;
        } else if (!guides.equals(this.lastGuides) || !colors.equals(this.lastColors)) {
            dirty = true;
        }

        // if nothing changed, we're done
        if (!dirty) {
            return;
        }

        ++this._state; // we're redrawing the canvas!

        const ctx = editor.getContext("2d", { alpha: false });
        ctx.drawImage(block.getSource(editor.width, colors), 0, 0);

        // draw the overlay after the block is copied out
        this.drawGuides(guides, block, ctx);

        // save the last-drawn state
        this.lastGuides = guides.copy();
        this.lastColors = colors.copy();
    }

    private drawGuides(guides: Guide, block: BlockInfo, ctx: CanvasRenderingContext2D): void {
        if (guides.type === GuideType.None) {
            return;
        }

        const cW = this.lastCellPx;
        const cellCount = block.getSize();
        const pixelSize = cW * cellCount;

        ctx.save();
        try {
            let at = 0;
            ctx.strokeStyle = guides.color;
            ctx.beginPath();
            for (let i = 1; i < cellCount; ++i) {
                at += cW;
                ctx.moveTo(at, 0);
                ctx.lineTo(at, pixelSize);
                ctx.moveTo(0, at);
                ctx.lineTo(pixelSize, at);
            }

            ctx.stroke();
        } catch (e) {
            console.error(e);
        }
        ctx.restore();
    }
}
