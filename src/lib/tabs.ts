export type CustomEventFn = (ev: CustomEvent) => void;

export class TabGroup {
    current: string = "";
    private handles: Map<string, TabHandle>;
    private listeners: Map<string, Set<CustomEventFn>>;

    constructor(public name: string) {
        this.handles = new Map();
        this.listeners = new Map();
        this.themeInit();
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

        for (const handle of this.handles.values()) {
            handle.name === name ? handle.activate() : handle.deactivate();
        }

        const prevName = this.current;
        this.current = name;
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

export class TabHandle {
    constructor(
        public name: string,
        public header: Element,
        public region: Element,
    ) {}

    activate() {
        this.header.classList.add("active");
        this.region.classList.remove("hide");
        this.update();
    }

    deactivate() {
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
