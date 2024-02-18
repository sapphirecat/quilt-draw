import Pickr from "@simonwep/pickr";
import { TabGroup } from "./tabs";
import { BlockEditor, Previewer } from "./view";
import { BlockInfo, Border, Guide, Palette, Quilt, Rect, RectBounds, Sashes } from "./model";
import { Click, Move, PickrHandle, Tool, UI } from "./ui-model";

// Indicates primary(0) or secondary(1) mouse button when setting active colors
type PaintSlot = 0 | 1;

// Block editor for the Editor tab
let editor: BlockEditor;
// Guides requested for the block editor
let guideType: HTMLSelectElement;
// Small quilt preview for the Editor tab
let miniPreviewer: Previewer;
// Large quilt preview for the Preview tab
let previewer: Previewer;

// Maximum width and height (it is square) of the block editor
const EDITOR_MAX_WIDTH = 630; // HACK: this is specified in our CSS
// Minimum width/height of he block editor
const EDITOR_MIN_WIDTH = 180;

// Number of pixels to leave between the edge of the window and our UI
const VIEWPORT_MARGIN = 24;

// Minimum size of the on-screen preview on the Preview tab
const PREVIEW_MIN_HEIGHT = 420;
// Maximum size of the on-screen preview on the Preview tab
const PREVIEW_MAX_HEIGHT = 1200;

// Minimum size of the preview on the Editor tab
const MINI_PREVIEW_MIN_HEIGHT = 300;
// Maximum size of the preview on the Editor tab
// noinspection JSSuspiciousNameCombination
const MINI_PREVIEW_MAX_HEIGHT = EDITOR_MAX_WIDTH;

// Minimum height of a rendered download, in pixels
const DOWNLOAD_MIN_HEIGHT = 1400;

// Maximum number of borders that may be added
const BORDER_LIMIT = 6;
// Maximum number of colors in the palette
const COLOR_LIMIT = 12;

// Whether to use pointer events or mouse events
const POINTER_EVENTS = "PointerEvent" in window;
// Move event type to use
const POINTER_MOVE = POINTER_EVENTS ? "pointermove" : "mousemove";

// All active Pickr elements in the page, indexed like "1" or "sash.0"
const pickers: { [key: string]: PickrHandle } = {};
// Quilt being displayed/edited
const quilt = new Quilt();
// Current UI state, e.g. selected tool
const ui = new UI();

// Mapping of HTML ID values to the Tool enum
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
    ui.setCursor(editor.canvas, getPaintClass());
    if (ui.moveStatus === Move.Ignore) {
        ui.moveStatus = Move.Allow;
    }

    // move the selection hint for primary color only
    if (slot === 0 && i !== prev) {
        document.getElementById(`color${prev}`).classList.remove("selected");
        document.getElementById(`color${i}`).classList.add("selected");
    }
}

function getPaintClass(): string {
    const paintNode = document.getElementById('tool-paint');

    return paintNode?.getAttribute('data-cursor-type') || "";
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
    initQuiltResize();

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
        app?.classList?.add("hide");

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

    err?.classList?.remove("hide");
}

function setupGlobalElements(): void {
    const edit = document.getElementById("editor") as HTMLCanvasElement;
    guideType = document.getElementById("guide-type") as HTMLSelectElement;

    if (edit) {
        editor = new BlockEditor(edit, EDITOR_MAX_WIDTH, EDITOR_MIN_WIDTH);
    }

    const preview = document.getElementById("preview");
    if (preview instanceof HTMLCanvasElement) {
        previewer = new Previewer(
            preview,
            new RectBounds(undefined, PREVIEW_MAX_HEIGHT),
            new RectBounds(undefined, PREVIEW_MIN_HEIGHT),
        );
    }

    const miniPreview = document.getElementById("mini-preview");
    if (miniPreview instanceof HTMLCanvasElement) {
        miniPreviewer = new Previewer(
            miniPreview,
            new RectBounds(undefined, editor?.width ?? MINI_PREVIEW_MAX_HEIGHT),
            new RectBounds(undefined, MINI_PREVIEW_MIN_HEIGHT),
        );
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
    if (!(editor && previewer)) {
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
    const canvas = editor.canvas;

    // Pointer-related events: try Pointer, fall back to Mouse.
    if (POINTER_EVENTS) {
        // set up editor
        canvas.addEventListener("pointerdown", e => onEditorMouse(e, true));
        canvas.addEventListener("pointerup", onEditorMouseRelease);
        canvas.addEventListener("pointercancel", onEditorMouseRelease);

        // set up main controls
        // we still get a click event, so we use ui.colorEvents to ignore one
        // if it follows a mousedown we took responsibility for.
        colorItems.addEventListener("pointerdown", onPaletteDown, { capture: true });
        colorItems.addEventListener("click", onPaletteClick, { capture: true });
    } else {
        canvas.addEventListener("mousedown", e => onEditorMouse(e, true));
        canvas.addEventListener("mouseup", onEditorMouseRelease);

        colorItems.addEventListener("mousedown", onPaletteDown, { capture: true });
        colorItems.addEventListener("click", onPaletteClick, { capture: true });
    }

    // set up the remaining (non-pointer) editor and color-picker events
    canvas.addEventListener("contextmenu", (ev) => ev.preventDefault());
    colorItems.addEventListener("contextmenu", (ev) => ev.preventDefault());

    // pre-select the paint tool
    ui.selectedTool = Tool.Paint;
    ui.setCursor(editor.canvas, getPaintClass());

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

function initQuiltResize(): void {
    // extract quilt dimensions from the HTML
    const quiltW = document.getElementById("quilt-size-w");
    const quiltH = document.getElementById("quilt-size-h");
    if (!(quiltW instanceof HTMLInputElement && quiltH instanceof HTMLInputElement)) {
        return;
    }

    const w = parseInt(quiltW.value, 10);
    const h = parseInt(quiltH.value, 10);
    if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
        return;
    }

    // set the dimensions
    quilt.resize(new Rect(w, h));

    // add event listeners
    const root = quiltW.closest('.control');
    root.addEventListener('input', onQuiltSize);
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
        updatePreview(quilt, previewer);
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
        ui.guides = new Guide(guideType.value);
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
    updatePreview(quilt, previewer);
}

function onSashColorReset(i: number): void {
    quilt.sash.colors[i] = pickers[`sash.${i}`].saved;
    updatePreview(quilt, previewer);
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
    updatePreview(quilt, previewer);
}

function onBorderColorReset(i: number): void {
    quilt.borders[i].color = pickers[`border.${i}`].saved;
    updatePreview(quilt, previewer);
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
    // accept only primary or secondary button, alone
    return !!(ev.buttons && ev.buttons < 3);
}

function isPrimaryButton(ev: MouseEvent): boolean {
    return ev.buttons === 1;
}

function isSecondaryButton(ev: MouseEvent): boolean {
    return ev.buttons === 2;
}

function editorClearMoveHandler(): void {
    editor.canvas.removeEventListener(POINTER_MOVE, onEditorMouse);
    ui.moveStatus = Move.Allow;
}

function editorSetMoveHandler(): void {
    ui.moveStatus = Move.Tracking;
    editor.canvas.addEventListener(POINTER_MOVE, onEditorMouse);
}

function onEditorMouseRelease(ev: MouseEvent): void {
    ev.preventDefault();
    editor.canvas.classList.remove('mouse-down');
    if (ui.moveStatus !== Move.Ignore) {
        editorClearMoveHandler();
    }
}

function onEditorMouse(ev: MouseEvent, isMouseDown?: boolean): void {
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

    // if this is mouse-down (not move), set up the classes/move tracking
    if (isMouseDown) {
        editor.canvas.classList.add('mouse-down');
        if (ui.moveStatus === Move.Allow) {
            editorSetMoveHandler();
        }
    }

    // the BoundingClientRect is relative to the viewport, as are clientX/Y
    const rect = editor.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const _ = Math.floor;

    // calculate hit positions
    const sz = quilt.blockCells;
    const cellPx = editor.width / sz;
    const index = _(x / cellPx) + sz * _(y / cellPx);
    const blk = editor.currentBlock;

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
    updatePreview(quilt, previewer);
}

function onQuiltSize(ev: Event): void {
    if (!(ev instanceof Event && ev.target instanceof HTMLInputElement)) {
        return;
    }

    const dir = ev.target.getAttribute('data-direction');
    const i = parseInt(ev.target.value, 10);
    if (isNaN(i) || i < 1 || (dir !== 'h' && dir !== 'w')) {
        return;
    }

    const cs = quilt.shape;
    quilt.resize(new Rect(
        dir === 'w' ? i : cs.w,
        dir === 'h' ? i : cs.h,
    ));

    updatePreview(quilt, previewer);
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
    if (!((node.id || "") in toolForId && node instanceof HTMLElement)) {
        return;
    }
    ui.selectedTool = toolForId[node.id];
    const data = node.dataset;

    // update movement state
    if (ui.moveStatus === Move.Tracking) {
        editorClearMoveHandler();
    }
    ui.moveStatus = data.moveTracking === "1" ? Move.Allow : Move.Ignore;

    // change the editor cursor
    ui.setCursor(editor.canvas, data.cursorType);

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
    updatePreview(quilt, previewer);
}

function onDownload(ev: MouseEvent): void {
    const node = ev.target;
    ev.preventDefault();

    if (!(node instanceof HTMLButtonElement)) {
        return;
    }

    // figure out what we're downloading
    const isPreview = node.id === "download-preview";
    const source = isPreview ? renderDownload(quilt) : editor.canvas;
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
        callback(quilt.blocks[editor.currentBlock]);
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

function onResizeViewport(): void {
    // HACK: Takes a max-width and grid (3 columns = 2*10px gap) into account
    const width = Math.min(window.innerWidth, 1600) - 20 - VIEWPORT_MARGIN;
    const height = window.innerHeight - VIEWPORT_MARGIN;
    const curShape = quilt.shape;
    const previewAspect = curShape.w / curShape.h;
    const modPxH = 30;
    let gridWidth: number;

    // determine the editor's natural size [4fr/9fr]
    gridWidth = width * (4 / 9);
    editor.resizeToBounds(gridWidth, height);

    // determine the mini preview's natural size [width/3 === *3fr/9fr]
    gridWidth = width / 3;
    miniPreviewer.resizeToBounds(new Rect(gridWidth, height), previewAspect, modPxH);

    // determine the full preview's natural size [7fr/9fr, usually height limited]
    gridWidth = width * (7 / 9);
    previewer.resizeToBounds(new Rect(gridWidth, height), previewAspect, modPxH);

    updateView();
}

function updateGuideColor(): void {
    ui.guides.type = guideType.value;
    editor.render(quilt, ui.guides);
}

function updatePreview(quilt: Quilt, preview: Previewer): void {
    const draw = preview.drawSize;
    const cellSizeFn = (cells: Rect) => {
        const minDimension = Math.min(draw.w / cells.w, draw.h / cells.h);

        return 2 * Math.floor(minDimension / 2);
    };

    preview.render(quilt, cellSizeFn, editor.state);
}

/**
 * Draw a large-size preview and return the canvas
 */
function renderDownload(quilt: Quilt): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    let renderer = new Previewer(
        canvas,
        new RectBounds(undefined, DOWNLOAD_MIN_HEIGHT),
        new RectBounds(),
    );
    renderer.ignoreDPR = true; // switch to download mode

    // no sequence number = redraw everything
    renderer.render(quilt, (cells) =>
        Math.max(12, 2 * Math.ceil(DOWNLOAD_MIN_HEIGHT / cells.h / 2)),
    );

    return canvas;
}

function updateView(): void {
    if (ui.tabs.current === "tab-quilt") {
        updatePreview(quilt, previewer);
    } else {
        editor.render(quilt, ui.guides);
        updatePreview(quilt, miniPreviewer);
    }
}

function randomColor(): string {
    const hue = Math.floor(Math.random() * 360);
    const sat = 45 + Math.floor(Math.random() * 35);
    const lns = 35 + Math.floor(Math.random() * 40);
    return `hsla(${hue}, ${sat}%, ${lns}%, 1.0)`;
}
