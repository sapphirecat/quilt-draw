import Pickr from "@simonwep/pickr";
import { TabGroup } from "./tabs";
import { Click, PickrHandle, RenderData, Tool, UI, ViewData } from "./view";
import { BlockInfo, Border, Color, Move, Palette, Quilt, Rect, Sashes, SashInfo } from "./model";

type PaintSlot = 0 | 1;

let editor: HTMLCanvasElement;
let preview: HTMLCanvasElement;
let miniPreview: HTMLCanvasElement;
let guideType: HTMLSelectElement;

let EDITOR_DRAW_WIDTH: number;
const EDITOR_MAX_WIDTH = 630; // HACK: this is specified in our CSS
// no EDITOR_DRAW/MAX_HEIGHT: it is square.
const VIEWPORT_MARGIN = 24;

let PREVIEW_DRAW_WIDTH: number;
let PREVIEW_DRAW_HEIGHT: number;
const PREVIEW_MIN_HEIGHT = 480;
const PREVIEW_MAX_HEIGHT = 1200;

let MINI_PREVIEW_DRAW_WIDTH: number;
let MINI_PREVIEW_DRAW_HEIGHT: number;
const MINI_PREVIEW_MIN_HEIGHT = 300;
// noinspection JSSuspiciousNameCombination
const MINI_PREVIEW_MAX_HEIGHT = EDITOR_MAX_WIDTH;

const DOWNLOAD_MIN_HEIGHT = 1400;

const BORDER_LIMIT = 6; // maximum number of borders that may be added
const COLOR_LIMIT = 12; // maximum number of colors in the palette

const POINTER_EVENTS = "PointerEvent" in window;
const POINTER_MOVE = POINTER_EVENTS ? "pointermove" : "mousemove";

const pickers: { [key: string]: PickrHandle } = {};
const view = new ViewData();
const miniView = new ViewData();
const quilt = new Quilt();
const ui = new UI();

const toolForId: { [key: string]: Tool } = {
    "tool-paint": Tool.Paint,
    "tool-spin-r": Tool.SpinR,
    "tool-spin-l": Tool.SpinL,
    "tool-flip-h": Tool.FlipH,
    "tool-flip-v": Tool.FlipV,
};

/**
 * Update the display of currently-selected paint colors.
 */
function showActiveColor(slot: number): void {
    const view = document.getElementById(`color-active-${slot}`);
    if (view) {
        const colorIndex = ui.paintColors[slot];
        view.style.backgroundColor = quilt.colorSet[colorIndex];
    } else {
        console.error("No element for '#color-active-%d'", slot);
    }
}

function setChecked(id: string, checked = true): void {
    try {
        const el = document.getElementById(id) as HTMLInputElement | null;
        el.checked = checked;
    } catch (e) {
        console.error(e);
    }
}

/**
 * Activate the paint tool with the selected palette entry.
 *
 * @param {number} i Palette index to be set as paint color.
 * @param {PaintSlot} [slot] A slot number to set, or the primary slot (0) by default.
 */
function setPaintColor(i: number, slot: PaintSlot = 0): void {
    const paints = ui.paintColors;
    const prev = paints[slot];

    paints[slot] = i;
    for (let s = 0; s < paints.length; s++) {
        if (paints[s] === i) {
            showActiveColor(s);
        }
    }

    // activate the tool
    ui.selectedTool = Tool.Paint;
    setChecked("tool-paint");
    if (ui.moveStatus === Move.Ignore) {
        ui.moveStatus = Move.Allow;
    }

    // move the selection hint for primary color only
    if (slot === 0 && i !== prev) {
        document.getElementById(`color${prev}`).classList.remove("selected");
        document.getElementById(`color${i}`).classList.add("selected");
    }
}

function getPalette(element?: Element): Palette {
    // we have some sentinel color values in here, to detect major errors in
    // script initialization.  we should never see these.
    if (!element) {
        return new Palette("#00ccff");
    }

    let colorText = element.getAttribute("data-initial-palette") || "#ff00ff";

    // process "light-mode|dark-mode" formatting
    const modeSep = colorText.indexOf("|");
    if (modeSep > -1) {
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
            colorText = colorText.substring(modeSep + 1);
        } else {
            colorText = colorText.substring(0, modeSep);
        }
    }

    // now apply the (sub)palette we chose
    const colors = colorText.split(/,\s*/);
    return new Palette(...colors);
}

/**
 * @param {string} id Element ID
 * @return {boolean} Whether the element is present and checked.
 */
function isChecked(id: string): boolean {
    const node = document.getElementById(id) as HTMLInputElement | null;
    return node && node.checked;
}

function initJsCore(): void {
    // set up UI
    initColors();
    initBorders();
    initTools();

    // get initial block size from the HTML
    const sizeInput = document.getElementById("cell-size");
    quilt.blockCells =
        sizeInput && sizeInput instanceof HTMLInputElement ? parseInt(sizeInput.value, 10) : 5;

    // start up the tabs
    const tabs = initTabs();
    if (tabs) {
        tabs.addEventListener("change", onTabChange);
        ui.tabs = tabs;
    }

    // un-hide JS content
    document.getElementById("app").classList.remove("hide");

    // set up semi-fluid UI
    window.addEventListener("resize", onResizeViewport);
    onResizeViewport();
}

function criticalError(e: any) {
    let message: string | false;

    try {
        console.error(e);

        if (e instanceof Error) {
            message = e.message;
        } else if (typeof e === "string") {
            message = e;
        } else {
            message = false;
        }
    } catch (e2) {
        console.error(e2);
    }

    // ensure the UI is hidden
    const app = document.getElementById("app");
    const err = document.getElementById("js-init-error");
    try {
        if (app) {
            app.classList.add("hide");
        }

        if (!err) {
            alert("An error occurred, and the HTML to display it is missing!");
            return;
        }

        const target = err.querySelector(".js-error-message");
        if (message && target instanceof HTMLElement) {
            target.innerText = message;
            target.parentElement.classList.remove("hide");
        }
    } catch (e3) {
        console.error(e3);
    }

    if (err) {
        err.classList.remove("hide");
    }
}

function setupGlobalElements(): void {
    editor = document.getElementById("editor") as HTMLCanvasElement;
    preview = document.getElementById("preview") as HTMLCanvasElement;
    miniPreview = document.getElementById("mini-preview") as HTMLCanvasElement;
    guideType = document.getElementById("guide-type") as HTMLSelectElement;

    if (editor) {
        EDITOR_DRAW_WIDTH = editor.width;
    }

    if (preview) {
        PREVIEW_DRAW_WIDTH = preview.width;
        PREVIEW_DRAW_HEIGHT = preview.height;
    }

    if (miniPreview) {
        MINI_PREVIEW_DRAW_WIDTH = miniPreview.width;
        MINI_PREVIEW_DRAW_HEIGHT = miniPreview.height;
    }

    // put the active highlight on the selected tool before we go
    for (const [id, tool] of Object.entries(toolForId)) {
        if (ui.selectedTool === tool) {
            const button = document.getElementById(id);
            if (button) {
                button.classList.add("active");
            }
        }
    }
}

export function initJs(): void {
    const urlView = document.getElementById("url-display") as HTMLElement;
    if (urlView && location?.href) {
        urlView.innerText = location.href;
    }

    setupGlobalElements();
    if (!(editor && preview)) {
        criticalError("Can't get editor and preview; doing nothing.");
        return;
    }

    try {
        initJsCore();
        document.getElementById("js-init-error")?.remove();
    } catch (e) {
        criticalError(e);
    }
}

function initTools(): void {
    const colorItems = document.getElementById("color-items");

    // Pointer-related events: try Pointer, fall back to Mouse.
    if (POINTER_EVENTS) {
        // set up editor
        editor.addEventListener("pointerdown", onEditorMouse);
        editor.addEventListener("pointerup", onEditorMouseRelease);
        editor.addEventListener("pointercancel", onEditorMouseRelease);

        // set up main controls
        // we still get a click event, so we use ui.colorEvents to ignore one
        // if it follows a mousedown we took responsibility for.
        colorItems.addEventListener("pointerdown", onPaletteDown, { capture: true });
        colorItems.addEventListener("click", onPaletteClick, { capture: true });
    } else {
        editor.addEventListener("mousedown", onEditorMouse);
        editor.addEventListener("mouseup", onEditorMouseRelease);

        colorItems.addEventListener("mousedown", onPaletteDown, { capture: true });
        colorItems.addEventListener("click", onPaletteClick, { capture: true });
    }

    // set up the remaining (non-pointer) editor and color-picker events
    editor.addEventListener("contextmenu", (ev) => ev.preventDefault());
    colorItems.addEventListener("contextmenu", (ev) => ev.preventDefault());

    // pre-select the paint tool to match the script state
    setChecked("tool-paint");

    // wire in the rest of the controls' events
    const nodeList = document.querySelectorAll(
        ".controls, #transforms input[type=range]",
    ) as NodeListOf<HTMLElement>;
    for (let i = 0; i < nodeList.length; i++) {
        nodeList[i].addEventListener("click", onControlClick);
    }

    // set up sashing colors
    initSashColors();
    if (isChecked("sash-on")) {
        quilt.sash.levels = isChecked("sash-cross-on") ? Sashes.Double : Sashes.Single;
    }

    // set up guide state
    initGuides();
}

function initBorders(): void {
    // create the default border
    ui.borderTemplate = document.getElementById("border-item") as HTMLTemplateElement;
    getPalette(ui.borderTemplate).forEach(addBorder);

    // set up events
    const root = ui.borderTemplate.parentElement;
    root.addEventListener("input", onBorderSize);

    const newBorder = () => {
        addBorder();
        updatePreview(quilt);
        if (quilt.borders.length >= BORDER_LIMIT) {
            document.getElementById("border-new").classList.add("hide");
        }
    };
    document.getElementById("border-new").addEventListener("click", newBorder);
}

function initSashColors(): void {
    const colors = getPalette(document.getElementById("sashing"));
    const targets = ["main-sash-color", "cross-sash-color"];
    if (colors.length !== targets.length) {
        console.error(
            "Sash palette length %d does not match UI element count %d",
            colors.length,
            targets.length,
        );
        return;
    }

    for (let i = 0; i < targets.length; i++) {
        const node = document.getElementById(targets[i]);
        if (!node) {
            console.error(`Target element id=${targets[i]} not found`);
            break; // fail somewhat gracefully
        }
        addSashColor(i, node, colors[i]);
    }
}

function initGuides(): void {
    if (guideType) {
        ui.guideColor = guideType.value;
        guideType.addEventListener("change", updateGuideColor);
        guideType.addEventListener("keyup", updateGuideColor);
    }
}

function initColors(): void {
    // set up global data for addColor
    ui.colorTemplate = document.getElementById("color-item") as HTMLTemplateElement;
    const colorBox = ui.colorTemplate.parentNode;

    // double-check that our requirements are fulfilled
    if (!(ui.colorTemplate && colorBox instanceof Element)) {
        console.error("Invalid HTML: missing *>template#color-item");
        return;
    }

    // parse the initial palette data and create Pickr UI
    // create Pickr UI for each initial palette entry
    getPalette(colorBox).forEach(addColor);

    // set the radio state to reflect the selected JS color
    const colorIndex = Math.min(ui.paintColors[0], quilt.colorSet.length - 1);
    if (colorIndex > -1) {
        document.getElementById(`color${colorIndex}`).classList.add("selected");
        showActiveColor(0);
    }

    showActiveColor(1);

    // set up "New Color" button
    document.getElementById("color-new").addEventListener("click", createColor);
}

function initTabs(): undefined | TabGroup {
    const root = document.getElementById("tabs-app");
    if (!root) {
        console.error("No #tabs-app element found");
        return;
    }

    return new TabGroup(root);
}

function createColor(): void {
    if (quilt.colorSet.length >= COLOR_LIMIT) {
        return;
    }

    const i = addColor(randomColor());
    setPaintColor(i);

    if (i + 1 >= COLOR_LIMIT) {
        document.getElementById("color-new").classList.add("hide");
    }
}

function newColorPicker(button: HTMLElement, value: string): Pickr {
    return new Pickr({
        el: button,
        theme: "nano",
        lockOpacity: true,
        default: value,
        defaultRepresentation: "HSLA",
        adjustableNumbers: true,

        components: {
            preview: true,
            hue: true,
            interaction: {
                hex: true,
                hsla: true,
                hsva: false,
                rgba: false,
                cmyk: false,

                input: true,
                cancel: true,
                save: false,
                clear: false,
            },
        },

        i18n: {
            "btn:cancel": "Reset",
            "aria:btn:cancel": "Reset and keep open",
        },
    });
}

function addColor(value: string): number | undefined {
    const i = quilt.colorSet.length;
    const item = ui.colorTemplate.content.cloneNode(true) as Element;

    // configure sub-DOM
    const button = item.querySelector(".color-button") as HTMLElement;
    if (!button) {
        console.error("Cannot find '.color-button' in ui.colorTemplate");
        return;
    }

    const dataNode = button.parentElement; // label.color-item
    dataNode.setAttribute("data-color-id", `${i}`);
    dataNode.id = `color${i}`;

    // define the color
    quilt.colorSet[i] = value;

    // activate the picker
    const picker = newColorPicker(button, value);

    // set up events
    picker.on("change", (newValue: Pickr.HSVaColor) => onColorChanged(i, newValue));
    picker.on("hide", () => onColorPickerHide(i));
    picker.on("cancel", () => onColorReset(i));

    // insert the whole template into the DOM
    ui.colorTemplate.parentNode.appendChild(item);

    // save the picker for future interaction
    pickers[i] = new PickrHandle(picker, value);

    return i;
}

function onColorPickerHide(i: number): void {
    pickers[i].saveColor(quilt.colorSet[i]);
    document.getElementById("color-items").focus({ preventScroll: true });
    setPaintColor(i);
}

function onColorChanged(i: number, value: Pickr.HSVaColor): void {
    quilt.colorSet[i] = value.toHSLA().toString();
    updateView();
}

function onColorReset(i: number): void {
    quilt.colorSet[i] = pickers[i].saved;
    updateView();
}

function onSashColorPickerHide(i: number): void {
    pickers[`sash.${i}`].saveColor(quilt.sash.colors[i]);
}

function onSashColorChanged(i: number, value: Pickr.HSVaColor) {
    quilt.sash.colors[i] = value.toHSLA().toString();
    updatePreview(quilt);
}

function onSashColorReset(i: number): void {
    quilt.sash.colors[i] = pickers[`sash.${i}`].saved;
    updatePreview(quilt);
}

function addSashColor(i: number, button: HTMLElement, value: string): void {
    const picker = newColorPicker(button, value);

    picker.on("change", (newValue: Pickr.HSVaColor) => onSashColorChanged(i, newValue));
    picker.on("hide", () => onSashColorPickerHide(i));
    picker.on("cancel", () => onSashColorReset(i));

    pickers[`sash.${i}`] = new PickrHandle(picker, value);
    quilt.sash.colors[i] = value;
}

function onBorderColorPickerHide(i: number): void {
    pickers[`border.${i}`].saveColor(quilt.borders[i].color);
}

function onBorderColorChanged(i: number, value: Pickr.HSVaColor): void {
    quilt.borders[i].color = value.toHSLA().toString();
    updatePreview(quilt);
}

function onBorderColorReset(i: number): void {
    quilt.borders[i].color = pickers[`border.${i}`].saved;
    updatePreview(quilt);
}

/**
 * Add another border layer
 */
function addBorder(color?: string): void {
    if (quilt.borders.length >= BORDER_LIMIT) {
        return;
    }

    const i = quilt.borders.length;
    const item = ui.borderTemplate.content.cloneNode(true) as Element;
    const range = item.querySelector("input[type=range]") as HTMLInputElement;
    const width = 1 + Math.floor(Math.random() * 3);
    const border = new Border(width, color || randomColor());

    item.querySelector("p").appendChild(document.createTextNode(`${i + 1}`));

    range.id = `borderWidth${i}`;
    range.setAttribute("data-border-index", `${i}`);
    range.value = `${border.cellWidth}`;

    const picker = newColorPicker(item.querySelector(".color-button"), border.color);
    // set up events
    picker.on("change", (newValue: Pickr.HSVaColor) => onBorderColorChanged(i, newValue));
    picker.on("hide", () => onBorderColorPickerHide(i));
    picker.on("cancel", () => onBorderColorReset(i));

    // commit changes
    quilt.borders[i] = border;
    pickers[`border.${i}`] = new PickrHandle(picker, border.color);
    ui.borderTemplate.parentElement.appendChild(item);
}

function onTabChange(_ev: CustomEvent) {
    updateView();
}

function isButtonRelevant(ev: MouseEvent): boolean {
    return !!(ev.buttons && ev.buttons < 3);
}

function isPrimaryButton(ev: MouseEvent): boolean {
    return ev.buttons === 1;
}

function isSecondaryButton(ev: MouseEvent): boolean {
    return ev.buttons === 2;
}

function editorClearMoveHandler(): void {
    editor.removeEventListener(POINTER_MOVE, onEditorMouse);
    ui.moveStatus = Move.Allow;
}

function editorSetMoveHandler(): void {
    ui.moveStatus = Move.Tracking;
    editor.addEventListener(POINTER_MOVE, onEditorMouse);
}

function onEditorMouseRelease(ev: MouseEvent): void {
    ev.preventDefault();
    if (ui.moveStatus !== Move.Ignore) {
        editorClearMoveHandler();
    }
}

function onEditorMouse(ev: MouseEvent): void {
    // if multiple buttons or a higher (aux etc.) button was pressed, ignore
    // everything. don't even prevent default.
    if (ev.buttons && !isButtonRelevant(ev)) {
        return;
    }

    // we are taking responsibility for this event
    ev.preventDefault();

    // if the mouse was released out-of-canvas, cancel ourselves
    if (!ev.buttons) {
        editorClearMoveHandler();
        return;
    }

    // if this is the first mousedown, set us up to be called on move
    if (ui.moveStatus === Move.Allow) {
        editorSetMoveHandler();
    }

    // the BoundingClientRect is relative to the viewport, as are clientX/Y
    const rect = editor.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const _ = Math.floor;

    // calculate hit positions
    const sz = quilt.blockCells;
    const cellPx = editor.width / sz;
    const index = _(x / cellPx) + sz * _(y / cellPx);
    const blk = ui.editorBlock;

    // act on the hit
    const isSecondaryClick = isSecondaryButton(ev);
    switch (ui.selectedTool) {
        case Tool.Paint:
            // translate coordinates to cell-relative
            const top = _(index / sz) * cellPx;
            const left = _(index % sz) * cellPx;
            const hitX = x - left;
            const hitY = y - top;

            // Map cell hits to sub-cell.  This uses the two diagonals: being
            // above both of them (y=x or TL/BR, and y=H-x or TR/BL) means being
            // in the "top" sub-cell.  TL and TR share the Top in common.  The
            // sub-cells are in CSS style, 0=top, 1=right, 2=bottom, 3=left.
            //
            // prettier-ignore
            const colorIndex = hitX > hitY ? // TR vs BL halves
                (hitX > cellPx - hitY ? 1 : 0) : // TR+BR ? right  : top
                (hitX > cellPx - hitY ? 2 : 3); //  BL+BR ? bottom : left

            // apply color to the index that was hit
            quilt.blocks[blk].paintSubCell(
                index,
                colorIndex,
                ui.paintColors[isSecondaryClick ? 1 : 0],
            );

            break;
        case Tool.SpinR:
        case Tool.SpinL:
            const spinLeft = ui.selectedTool === Tool.SpinL;
            // use not-equal as logical XOR: rotate leftward if exactly one of
            // "the leftward tool mode is active" or "isSecondaryClick happened"
            quilt.blocks[blk].spinCell(index, spinLeft !== isSecondaryClick);
            break;
        case Tool.FlipH:
        case Tool.FlipV:
            const flipVertical = ui.selectedTool === Tool.FlipV;
            // logical XOR (see Spin above for details)
            quilt.blocks[blk].flipCell(index, flipVertical !== isSecondaryClick);
            break;
        default:
            console.error("Unknown tool selected: %d", ui.selectedTool);
    }

    updateView();
}

function onBorderSize(ev: Event): void {
    if (!(ev instanceof Event && ev.target instanceof HTMLInputElement)) {
        return;
    }

    const i = parseInt(ev.target.getAttribute("data-border-index") || "0", 10) || 0;
    quilt.borders[i].cellWidth = parseInt(ev.target.value, 10);
    updatePreview(quilt);
}

/**
 * Delegating event handler for control input-radio clicks
 */
function onControlClick(ev: MouseEvent): void {
    const target = ev.target;
    if (!(target instanceof Element)) {
        return;
    }
    const parentInput = target.closest("button, input");
    if (!parentInput) {
        return;
    }

    const classes = parentInput.classList;
    if (classes.contains("resize")) {
        onResizeInput(ev);
    } else if (classes.contains("sash-select")) {
        onSashChange(ev);
    } else if (classes.contains("tool-item")) {
        onToolChange(ev, parentInput);
    } else if (classes.contains("roll")) {
        onRollerClick(ev);
    } else if (classes.contains("download")) {
        onDownload(ev);
    }
}

/**
 * Capturing event handler for palette
 */
function onPaletteDown(ev: MouseEvent): void {
    ui.colorEvents = Click.Allow; // by default, we do not have full responsibility
    if (!isButtonRelevant(ev) || !(ev.target instanceof HTMLButtonElement)) {
        return; // we don't handle this button/combo
    }

    const node = ev.target.closest("label.color-item");
    if (!(node && node instanceof HTMLElement)) {
        console.error("label.color-item element not found in event stack");
        return;
    }

    const colorIndex = parseInt(node.getAttribute("data-color-id"), 10);

    // if this is a PRIMARY click on a SELECTED color, pass the event through
    // to Pickr. we'll update the color when the picker is closed.
    if (isPrimaryButton(ev) && colorIndex === ui.paintColors[0]) {
        return;
    }

    // SECONDARY click or NON-SELECTED color. Take over the event ourselves.
    ev.preventDefault();
    ev.stopPropagation();
    ui.colorEvents = Click.Ignore; // reject a 'click' if it is also generated
    setPaintColor(colorIndex, isSecondaryButton(ev) ? 1 : 0);
}

function onPaletteClick(ev: MouseEvent): void {
    if (ui.colorEvents === Click.Ignore) {
        ev.stopPropagation();
        ev.preventDefault();
    }

    ui.colorEvents = Click.Allow;
}

function onToolChange(ev: MouseEvent, node: Element): void {
    const region = ev.currentTarget;
    if (!((node.id || "") in toolForId)) {
        return;
    }
    ui.selectedTool = toolForId[node.id];

    // update movement state
    if (ui.moveStatus === Move.Tracking) {
        editorClearMoveHandler();
    }
    ui.moveStatus = node.getAttribute("data-move-tracking") === "1" ? Move.Allow : Move.Ignore;

    // change the active-button state
    if (region instanceof Element) {
        for (const button of region.querySelectorAll(".tool-item.active")) {
            button.classList.remove("active");
        }
    }
    node.classList.add("active");
}

function onSashChange(ev: MouseEvent): void {
    // do-nothing op to make the event appear used. maintains a consistent
    // interface across all the `onSomeEvent(ev)` functions.
    if (ev.defaultPrevented) {
        return;
    }

    const main = document.getElementById("sash-on") as HTMLInputElement;
    const cross = document.getElementById("sash-cross-on") as HTMLInputElement;

    quilt.sash.levels = main.checked
        ? cross.checked
            ? Sashes.Double
            : Sashes.Single
        : Sashes.None;
    updatePreview(quilt);
}

function onDownload(ev: MouseEvent): void {
    const node = ev.target;
    ev.preventDefault();

    if (!(node instanceof HTMLButtonElement)) {
        return;
    }

    // figure out what we're downloading
    const isPreview = node.id === "download-preview";
    const source = isPreview ? renderDownload(quilt) : editor;
    const basename = isPreview ? "quilt" : "block";

    // generate download
    const link = document.createElement("a");
    link.setAttribute("href", source.toDataURL("image/png"));
    link.setAttribute("download", `${basename}.png`);
    document.body.appendChild(link); // Pale Moon
    link.click();
    document.body.removeChild(link); // Pale Moon
}

/**
 * Roll the quilt block in some direction.
 */
function onRollerClick(ev: MouseEvent): void {
    const movers = {
        "roll-up": (b: BlockInfo) => b.rollUp(),
        "roll-down": (b: BlockInfo) => b.rollDown(),
        "roll-left": (b: BlockInfo) => b.rollLeft(),
        "roll-right": (b: BlockInfo) => b.rollRight(),
    };

    if (!(ev.target instanceof Element)) {
        return;
    }

    const id = ev.target.id as keyof typeof movers;
    const callback = movers[id];
    if (callback) {
        callback(quilt.blocks[ui.editorBlock]);
        updateView();
    }
}

/**
 * Resize the quilt's cells-per-block.
 */
function onResizeInput(ev: MouseEvent): void {
    const node = ev.target;
    if (!(node instanceof HTMLInputElement)) {
        return;
    }

    // perform the resizing operation
    quilt.blockCells = parseInt(node.value, 10);

    // update the view
    updateView();
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(n, lo));
}

function fitRectH(boundW: number, boundH: number, aspect: number, modPxH: number): number {
    const modPxW = Math.floor(modPxH * aspect);

    // shrink the bounds to wrap the quantum of space the caller wanted
    boundW -= boundW % modPxW;
    boundH -= boundH % modPxH;

    // calculate the width based purely on the actual height
    const altW = Math.floor(boundH * aspect);
    const finalW = Math.min(boundW, altW);

    return Math.ceil(finalW / aspect);
}

function onResizeViewport(): void {
    // HACK: Takes a max-width and grid (3 columns = 2*10px gap) into account
    const width = Math.min(window.innerWidth, 1600) - 20 - VIEWPORT_MARGIN;
    const height = window.innerHeight - VIEWPORT_MARGIN;
    const previewAspect = quilt.shape.w / quilt.shape.h;
    const modPxH = 30;
    let gridWidth: number;

    // determine the editor's natural size [4fr/9fr]
    gridWidth = width * (4 / 9);
    let editorH = fitRectH(gridWidth, height, 1.0, 12);
    EDITOR_DRAW_WIDTH = Math.min(editorH, EDITOR_MAX_WIDTH);

    // determine the mini preview's natural size [width/3 === *3fr/9fr]
    gridWidth = width / 3;
    const miniH = fitRectH(gridWidth, height, previewAspect, modPxH);
    MINI_PREVIEW_DRAW_HEIGHT = clamp(miniH, MINI_PREVIEW_MIN_HEIGHT, MINI_PREVIEW_MAX_HEIGHT);
    MINI_PREVIEW_DRAW_WIDTH = Math.floor(MINI_PREVIEW_DRAW_HEIGHT * previewAspect);

    // determine the full preview's natural size [7fr/9fr, usually height limited]
    gridWidth = width * (7 / 9);
    const previewH = fitRectH(gridWidth, height, previewAspect, modPxH);
    PREVIEW_DRAW_HEIGHT = clamp(previewH, PREVIEW_MIN_HEIGHT, PREVIEW_MAX_HEIGHT);
    PREVIEW_DRAW_WIDTH = Math.floor(PREVIEW_DRAW_HEIGHT * previewAspect);

    updateView();
}

/**
 * Resize a canvas to a specific physical and logical size.
 * @param canvas Canvas to resize
 * @param size Logical size (CSS pixels) to resize to
 * @param ignoreDPR TRUE to ignore the device pixel ratio (for downloads)
 */
function sizeCanvasTo(canvas: HTMLCanvasElement, size: Rect, ignoreDPR?: boolean) {
    const DPR = ignoreDPR ? 1 : Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = size.w * DPR;
    canvas.height = size.h * DPR;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
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

function updateGuideColor(): void {
    if (!guideType || guideType.value === ui.guideColor) {
        return;
    }

    updateEditor(quilt.colorSet, quilt.blocks[ui.editorBlock]);
}

function drawGuides(block: BlockInfo, ctx: CanvasRenderingContext2D): void {
    if (guideType.value === "") {
        // we don't want to draw anything on it
        ui.guideColor = "";

        return;
    }

    const cW = ui.cellPx;
    const cellCount = block.getSize();
    const pixelSize = cW * cellCount;

    ctx.save();
    try {
        let at = 0;
        ctx.strokeStyle = guideType.value;
        ctx.beginPath();
        for (let i = 1; i < cellCount; ++i) {
            at += cW;
            ctx.moveTo(at, 0);
            ctx.lineTo(at, pixelSize);
            ctx.moveTo(0, at);
            ctx.lineTo(pixelSize, at);
        }

        ctx.stroke();

        ui.guideColor = guideType.value;
    } catch (e) {
        console.error(e);
    }
    ctx.restore();
}

/**
 * Draw a block into the editor area of the canvas.
 */
function updateEditor(colors: Palette, block: BlockInfo): void {
    // render the blockInfo into the editor canvas
    const cellCount = block.getSize();
    let dirty = block.isDirty();

    // Resize editor if needed, assuming square
    const cW = 2 * Math.floor(EDITOR_DRAW_WIDTH / cellCount / 2);
    const pixelSize = cW * cellCount;
    if (cW !== ui.cellPx || editor.style.width === "") {
        ui.cellPx = cW;
        sizeCanvasTo(editor, new Rect(pixelSize, pixelSize));
        dirty = true;
    }

    if (dirty) {
        ui.editorState += 1; // we're redrawing the canvas!
    }

    const ctx = editor.getContext("2d", { alpha: false });
    ctx.drawImage(block.getSource(editor.width, colors), 0, 0);

    // draw on the UI-only state after the block is copied out
    drawGuides(block, ctx);
}

function deepCopy<T>(x: T): T {
    return JSON.parse(JSON.stringify(x));
}

/**
 * Pre-scale and draw quilt blocks into a canvas.
 */
function drawPreviewBlocks(ctx: CanvasRenderingContext2D, r: RenderData): void {
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

function drawPreviewBorders(
    prevState: Array<Border> | null,
    ctx: CanvasRenderingContext2D,
    r: RenderData,
): void {
    let oX = 0;
    let oY = 0;
    let w = r.canvasSize.w;
    let h = r.canvasSize.h;

    const borders = quilt.borders;
    for (let i = 0; i < borders.length; i++) {
        const border = borders[i];
        const viewBorder = prevState && i < prevState.length ? prevState[i] : null;

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

function drawPreviewSash(
    vs: SashInfo | null,
    ctx: CanvasRenderingContext2D,
    sash: SashInfo,
    r: RenderData,
): void {
    if (sash.levels === Sashes.None) {
        return;
    }

    const sashSpacing = r.cellSize;
    const blockSize = r.blockSize;
    const padSize = r.padSize;
    const borderSize = 2 * padSize;
    const viewColors = vs && vs.levels === sash.levels ? vs.colors : ([] as Color[]);
    const drawMain = !(vs && viewColors && viewColors[0] === sash.colors[0]);
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

/**
 * Draw a quilt to a canvas for on-screen display.
 *
 * @param canvas Canvas to draw into
 * @param r Render data for the current quilt data
 * @param v Visible quilt information (last render; updated to match this render)
 */
function drawPreviewOnScreen(canvas: HTMLCanvasElement, r: RenderData, v: ViewData): void {
    // extract some information we will reference a lot
    const cellSize = r.cellSize,
        quilt = r.quilt,
        visQuilt = v.quilt, // visible quilt on-screen
        sash = quilt.sash;

    // resize the canvas to the draw dimensions if needed
    const layout = `${cellSize},${r.cells},${r.hasSash ? "sash" : "noSash"}`;
    let fullRedraw = layout !== v.layout || v.editorState < 0;
    if (fullRedraw) {
        v.layout = layout;
        sizeCanvasTo(canvas, r.canvasSize);
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
    const ctx = canvas.getContext("2d", { alpha: false });
    const DPR = getDPR(canvas, r.canvasSize);

    ctx.save();
    ctx.scale(DPR, DPR);

    // draw changes to borders
    drawPreviewBorders(fullRedraw ? null : visQuilt.borders, ctx, r);
    visQuilt.borders = deepCopy(quilt.borders);

    // draw main sashing, if applicable
    if (r.hasSash) {
        drawPreviewSash(fullRedraw ? null : visQuilt.sash, ctx, sash, r);
        visQuilt.sash = deepCopy(sash);
    } else if (visQuilt.sash.levels !== Sashes.None) {
        visQuilt.sash = new SashInfo();
    }

    // draw the 5x4 blocks, inset by the half-border-width padSize, and offset
    // by sashing if specified
    if (fullRedraw || ui.editorState !== v.editorState) {
        drawPreviewBlocks(ctx, r);
        v.editorState = ui.editorState;
    }

    ctx.restore();
}

function previewCellSizeFn(drawW: number, drawH: number): (cells: Rect) => number {
    return (cells: Rect) => {
        const minDimension = Math.min(drawW / cells.w, drawH / cells.h);

        return 2 * Math.floor(minDimension / 2);
    };
}

function updatePreview(quilt: Quilt): void {
    const r = new RenderData(quilt, previewCellSizeFn(PREVIEW_DRAW_WIDTH, PREVIEW_DRAW_HEIGHT));

    drawPreviewOnScreen(preview, r, view);
}

function updateMiniPreview(quilt: Quilt): void {
    const r = new RenderData(
        quilt,
        previewCellSizeFn(MINI_PREVIEW_DRAW_WIDTH, MINI_PREVIEW_DRAW_HEIGHT),
    );

    drawPreviewOnScreen(miniPreview, r, miniView);
}

/**
 * Draw a large-size preview and return the canvas
 */
function renderDownload(quilt: Quilt): HTMLCanvasElement {
    // offscreen canvas
    const canvas = document.createElement("canvas");

    // calculate draw dimensions
    const r = new RenderData(quilt, (cells) =>
        Math.max(12, 2 * Math.ceil(DOWNLOAD_MIN_HEIGHT / cells.h / 2)),
    );
    sizeCanvasTo(canvas, r.canvasSize, true);

    // start drawing
    const ctx = canvas.getContext("2d", { alpha: false });
    drawPreviewBorders(null, ctx, r);
    if (r.hasSash) {
        drawPreviewSash(null, ctx, quilt.sash, r);
    }
    drawPreviewBlocks(ctx, r);

    return canvas;
}

function updateView(): void {
    if (ui.tabs.current === "tab-quilt") {
        updatePreview(quilt);
    } else {
        updateEditor(quilt.colorSet, quilt.blocks[ui.editorBlock]);
        updateMiniPreview(quilt);
    }
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

function randomColor(): string {
    const hue = Math.floor(Math.random() * 360);
    const sat = 45 + Math.floor(Math.random() * 35);
    const lns = 35 + Math.floor(Math.random() * 40);
    return `hsla(${hue}, ${sat}%, ${lns}%, 1.0)`;
}
