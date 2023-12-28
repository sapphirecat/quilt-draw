// Definitions to break forward-reference problems in ui.ts

import Pickr from "@simonwep/pickr";
import { TabGroup } from "./tabs";
import { Color, Guide } from "./model";

export enum Move {
    Ignore, // tool does not allow holding mouse down
    Allow, // tool supports holding mouse down, but handler is inactive
    Tracking, // mouse is down, and event handler is active
}

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

export class UI {
    /** tabs (editor/preview) */
    tabs: TabGroup | null = null;
    /** whether clicks on Pickr elements should be passed into Pickr */
    colorEvents: Click = Click.Allow;
    /** HTML template for new colors */
    colorTemplate: HTMLTemplateElement | null = null;
    /** HTML template for new borders */
    borderTemplate: HTMLTemplateElement | null = null;
    /** Current guide state, shown between squares in the block editor */
    guides: Guide;
    /** Primary and secondary paint colors */
    paintColors: [number, number] = [1, 0];
    /** Currently active tool ID */
    selectedTool: Tool = Tool.Paint;
    /** Whether the selectedTool handles mousemove gracefully (Move.ALLOW) */
    moveStatus: Move = Move.Allow;
    /** Selected tool's cursor-defining class name */
    toolClass: string = "";

    setCursor(target: HTMLElement, name: string) {
        if (this.toolClass !== "") {
            target.classList.remove(this.toolClass);
        }
        if (name !== "") {
            target.classList.add(name);
            this.toolClass = name;
        }
    }
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
