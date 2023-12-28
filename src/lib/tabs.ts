export type CustomEventFn = (ev: CustomEvent) => void;

function getAnchorName(a: HTMLAnchorElement): string {
    const href = a.href;
    const split = href.lastIndexOf("#");

    return split > -1 ? href.substring(split + 1) : "";
}

export class TabGroup {
    current: string = "";
    private handles: Map<string, TabHandle>;
    private listeners: Map<string, Set<CustomEventFn>>;

    constructor(container: HTMLElement) {
        this.handles = new Map();
        this.listeners = new Map();
        this.themeInit();
        this.domInit(container);
    }

    addHandle(handle: TabHandle) {
        // extra paranoia to make sure tab our initializer is invalid
        if (handle.name === "") {
            throw new Error("Tab name is required");
        }

        // store the handle by its name
        this.handles.set(handle.name, handle);

        // display first tab / hide subsequent tabs
        if (this.current === "") {
            this.select(handle.name);
        } else {
            handle.deactivate();
        }
    }

    select(name: string) {
        if (name === this.current) {
            return;
        }

        const active = [];
        let match;
        for (const handle of this.handles.values()) {
            if (handle.name === name) {
                match = handle;
            } else if (handle.active) {
                active.push(handle);
            }
        }
        if (!match) {
            console.error("select tab %s: no match", name);
        }
        if (this.current !== "" && !active.length) {
            console.error("select tab %s: none active after init", name);
            return;
        }

        // activate the UI
        for (const handle of active) {
            handle.deactivate();
        }
        match.activate();

        // store the state change
        const prevName = this.current;
        this.current = name;

        // notify listeners
        this.emit("change", { name: prevName });
    }

    addEventListener(name: string, fn: CustomEventFn) {
        if (!this.listeners.has(name)) {
            this.listeners.set(name, new Set([fn]));
        } else {
            this.listeners.get(name).add(fn);
        }
    }

    // noinspection JSUnusedGlobalSymbols
    removeEventListener(name: string, fn: CustomEventFn) {
        this.listeners.get(name)?.delete(fn);
    }

    private domInit(root: HTMLElement) {
        const tabRow = root.querySelector(":scope > .tabs-select-row");
        if (!tabRow) {
            return;
        }

        const regions = new Map<string, Element>();
        // pre-process the regions so we don't have O(N^2) lookups
        for (const region of root.querySelectorAll(":scope > .tab-region[id]")) {
            regions.set(region.id, region);
        }
        // process the tabs, that select the regions
        for (const tab of tabRow.querySelectorAll(":scope > .tab-select")) {
            const anchor = tab.querySelector("a[href^='#']");
            if (!(anchor && anchor instanceof HTMLAnchorElement)) {
                console.error("Tab missing/incorrect <a> element in %s", root.id);
                continue;
            }

            const name = getAnchorName(anchor);

            if (name.length > 0 && regions.has(name)) {
                this.addHandle(new TabHandle(name, tab, regions.get(name)));
                continue;
            }

            // report a detailed error
            if (name.length === 0) {
                console.error("Tab has no name in %s", root.id);
            } else {
                console.error("Tab missing related #%s.tab-region in %s", name, root.id);
            }
        }

        // set event handler on tabRow
        tabRow.addEventListener("click", (ev) => {
            const e = ev.target;
            ev.preventDefault();

            if (!(e instanceof HTMLAnchorElement)) {
                return;
            }

            const name = getAnchorName(e);
            if (name && name.length > 0) {
                this.select(name);
            }
        });
    }

    private themeInit() {
        if (typeof window.matchMedia !== "function") {
            return;
        }

        const mm = window.matchMedia("(prefers-color-scheme: dark)");
        if (typeof mm.addEventListener === "function") {
            const onChange = (_ev: MediaQueryListEvent) => {
                // const isDark: boolean = ev.matches;
                if (this.current !== "") {
                    this.handles.get(this.current).update();
                }
            };

            mm.addEventListener("change", onChange);
        }
    }

    private emit(name: string, data: any) {
        if (!this.listeners.has(name)) {
            return;
        }

        for (const fn of this.listeners.get(name).values()) {
            const ev = new CustomEvent(name, { detail: data });
            fn(ev);
        }
    }
}

class TabHandle {
    private isActive: boolean = false;

    constructor(
        public name: string,
        public header: Element,
        public region: Element,
    ) {}

    get active(): boolean {
        return this.isActive;
    }

    activate() {
        this.isActive = true;
        this.header.classList.add("active");
        this.region.classList.remove("hide");
        this.update();
    }

    deactivate() {
        this.isActive = false;
        this.header.classList.remove("active");
        this.region.classList.add("hide");
        if (this.header instanceof HTMLElement) {
            this.header.style.borderBottomColor = "transparent";
        }
    }

    update() {
        if (!(this.header instanceof HTMLElement)) {
            return;
        }

        // i guess we MUST know which element actually has a style set
        const src = getComputedStyle(document.body);
        this.header.style.borderBottomColor = src.backgroundColor;
    }
}
