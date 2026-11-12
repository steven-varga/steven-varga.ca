/**
 * Whiteboard plugin for Reveal.js using Paper.js
 * High-performance vector drawing layer for notes on slides, highlighter marker,
 * glowing laser pointer with vanishing trail, and full blank chalkboard.
 */

let Whiteboard = {
    id: "whiteboard",
    init: function(deck) {
        init_whiteboard(deck);
    },
    select_tool: function(tool) { if (window._wb) window._wb.select_tool(tool); },
    toggle_canvas: function() { if (window._wb) window._wb.toggle_canvas(); },
    toggle_board: function() { if (window._wb) window._wb.toggle_board(); },
    toggle_pen: function() { if (window._wb) window._wb.select_tool('pen'); },
    toggle_marker: function() { if (window._wb) window._wb.select_tool('marker'); },
    toggle_laser: function() { if (window._wb) window._wb.select_tool('laser'); },
    color_next: function() { if (window._wb) window._wb.color_next(); },
    color_prev: function() { if (window._wb) window._wb.color_prev(); },
    set_color: function(idx) { if (window._wb) window._wb.set_color(idx); },
    clear: function() { if (window._wb) window._wb.clear(); },
    download: function() { if (window._wb) window._wb.download(); },
};

const init_whiteboard = function(Reveal) {
    const THEME_PALETTES = {
        sigma: [
            { name: "Amber", hex: "#f2a100" },
            { name: "Gold", hex: "#ffc14a" },
            { name: "Orange", hex: "#f97316" },
            { name: "Red", hex: "#ff4d3d" },
            { name: "Green", hex: "#00d26a" },
            { name: "Parchment", hex: "#f1e0b7" },
            { name: "White", hex: "#ffffff" }
        ],
        solarized: [
            { name: "Orange", hex: "#cb4b16" },
            { name: "Blue", hex: "#268bd2" },
            { name: "Green", hex: "#859900" },
            { name: "Red", hex: "#dc322f" },
            { name: "Yellow", hex: "#b58900" },
            { name: "Cyan", hex: "#2aa198" },
            { name: "White", hex: "#ffffff" }
        ],
        modern: [
            { name: "Indigo", hex: "#6366f1" },
            { name: "Cyan", hex: "#06b6d4" },
            { name: "Orange", hex: "#f97316" },
            { name: "Green", hex: "#10b981" },
            { name: "Red", hex: "#ef4444" },
            { name: "Muted", hex: "#d4d4d8" },
            { name: "White", hex: "#ffffff" }
        ]
    };

    function get_initial_palette() {
        const theme = document.body ? (document.body.getAttribute("data-theme") || "sigma") : "sigma";
        const pal = THEME_PALETTES[theme] || THEME_PALETTES.sigma;
        return pal.map(p => ({ name: p.name, hex: p.hex }));
    }

    const palette = get_initial_palette();

    let color_idx = 0;
    let pen_stroke_width = 3.5;
    let marker_stroke_width = 22;
    let current_tool = "pen"; // "pen" | "marker" | "laser"
    let is_overlay = false;
    let is_board = false;
    let active_path = null;
    const layers = new Map();

    // Laser pointer state
    let laser_drawing = false;
    let laser_trail = []; // Array of { x, y, time }
    let laser_anim_id = null;
    const TRAIL_DURATION = 650; // ms responsive vanishing trail

    const canvas = document.getElementById("whiteboard");
    if (!canvas) {
        console.warn("Whiteboard: canvas element #whiteboard not found");
        return;
    }

    // Initialize Paper.js on whiteboard canvas
    paper.setup(canvas);
    const project = paper.project;

    // Create or locate dedicated laser canvas for high-performance glowing trails
    let laserCanvas = document.getElementById("wb-laser-canvas");
    if (!laserCanvas) {
        laserCanvas = document.createElement("canvas");
        laserCanvas.id = "wb-laser-canvas";
        laserCanvas.className = "wb-laser-canvas";
        document.body.appendChild(laserCanvas);
    }
    const laserCtx = laserCanvas.getContext("2d");

    // Create or locate laser pointer dot element
    let laserDot = document.getElementById("wb-laser-dot");
    if (!laserDot) {
        laserDot = document.createElement("div");
        laserDot.id = "wb-laser-dot";
        laserDot.className = "wb-laser-dot";
        document.body.appendChild(laserDot);
    }

    function resize_laser_canvas() {
        const dpr = window.devicePixelRatio || 1;
        laserCanvas.width = window.innerWidth * dpr;
        laserCanvas.height = window.innerHeight * dpr;
        laserCanvas.style.width = window.innerWidth + "px";
        laserCanvas.style.height = window.innerHeight + "px";
    }
    resize_laser_canvas();

    // Create presenter toolbar UI
    const toolbar = document.createElement("div");
    toolbar.className = "whiteboard-toolbar";
    toolbar.innerHTML = `
        <div class="wb-tool-group">
            <button class="wb-btn wb-tool-btn wb-pen-btn" data-tool="pen" title="Pen (P)"><i class="fas fa-pen"></i></button>
            <button class="wb-btn wb-tool-btn wb-marker-btn" data-tool="marker" title="Marker / Highlighter (M)"><i class="fas fa-highlighter"></i></button>
            <button class="wb-btn wb-tool-btn wb-laser-btn" data-tool="laser" title="Laser Pointer (L)"><i class="fas fa-bullseye"></i></button>
        </div>
        <button class="wb-btn wb-board-btn" title="Toggle Blank Board (B)"><i class="fas fa-chalkboard"></i></button>
        <div class="wb-palette">
            ${palette.map((c, i) => `<button class="wb-color-dot ${i === 0 ? 'active' : ''}" data-idx="${i}" style="background:${c.hex};" title="${c.name} (X/Y)"></button>`).join('')}
        </div>
        <button class="wb-btn wb-clear-btn" title="Clear Slide Drawings (DEL)"><i class="fas fa-trash-alt"></i></button>
        <button class="wb-btn wb-download-btn" title="Save Drawing (D)"><i class="fas fa-download"></i></button>
    `;
    document.body.appendChild(toolbar);

    const penBtn = toolbar.querySelector(".wb-pen-btn");
    const markerBtn = toolbar.querySelector(".wb-marker-btn");
    const laserBtn = toolbar.querySelector(".wb-laser-btn");
    const boardBtn = toolbar.querySelector(".wb-board-btn");
    const clearBtn = toolbar.querySelector(".wb-clear-btn");
    const downloadBtn = toolbar.querySelector(".wb-download-btn");
    const colorDots = toolbar.querySelectorAll(".wb-color-dot");

    function get_current_color() {
        return palette[color_idx].hex;
    }

    function hexToRgb(hex) {
        const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    function update_laser_color() {
        const hex = get_current_color();
        laserDot.style.setProperty("--laser-color", hex);
        const rgb = hexToRgb(hex);
        if (rgb) {
            laserDot.style.setProperty("--laser-glow", `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`);
        }
    }

    function update_ui() {
        const is_active = is_overlay || is_board;
        if (is_active) {
            canvas.classList.add("wb-active");
            toolbar.classList.add("wb-active");
        } else {
            canvas.classList.remove("wb-active");
            toolbar.classList.remove("wb-active");
        }

        if (is_board) {
            canvas.classList.add("wb-blank-board");
            boardBtn.classList.add("active");
        } else {
            canvas.classList.remove("wb-blank-board");
            boardBtn.classList.remove("active");
        }

        // Tool classes on canvas
        canvas.classList.remove("wb-tool-pen", "wb-tool-marker", "wb-tool-laser");
        if (is_active) {
            canvas.classList.add(`wb-tool-${current_tool}`);
        }

        // Active tool highlights
        penBtn.classList.toggle("active", is_active && current_tool === "pen");
        markerBtn.classList.toggle("active", is_active && current_tool === "marker");
        laserBtn.classList.toggle("active", is_active && current_tool === "laser");

        // Laser pointer state
        if (is_active && current_tool === "laser") {
            update_laser_color();
        } else {
            laserDot.classList.remove("visible", "pulsing");
            laser_drawing = false;
            laser_trail = [];
            if (laserCtx) {
                laserCtx.save();
                laserCtx.setTransform(1, 0, 0, 1, 0, 0);
                laserCtx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);
                laserCtx.restore();
            }
            if (laser_anim_id) {
                cancelAnimationFrame(laser_anim_id);
                laser_anim_id = null;
            }
        }

        // Color palette selection state
        colorDots.forEach((dot, idx) => {
            if (idx === color_idx) dot.classList.add("active");
            else dot.classList.remove("active");
        });
    }

    function hash() {
        const i = Reveal.getIndices();
        return `${i.h}_${i.v}_${i.f !== undefined ? i.f : 0}`;
    }

    function change_page() {
        const page_id = hash();
        // Hide all layers
        project.layers.forEach(l => { l.visible = false; });

        // Reset any transient laser trail on slide change
        laser_trail = [];
        if (laserCtx) {
            laserCtx.save();
            laserCtx.setTransform(1, 0, 0, 1, 0, 0);
            laserCtx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);
            laserCtx.restore();
        }

        if (is_board) {
            // Shared board layer
            let board_layer = layers.get("__board__");
            if (!board_layer) {
                board_layer = new paper.Layer();
                layers.set("__board__", board_layer);
                project.addLayer(board_layer);
            }
            board_layer.visible = true;
            board_layer.activate();
            paper.view.draw();
            return;
        }

        // Slide specific layer
        let layer = layers.get(page_id);
        if (!layer) {
            layer = new paper.Layer();
            layers.set(page_id, layer);
            project.addLayer(layer);
        }
        layer.visible = true;
        layer.activate();
        paper.view.draw();
    }

    function select_tool(tool) {
        if (is_board) {
            current_tool = tool;
        } else if (is_overlay && current_tool === tool) {
            // Clicking current active tool toggles overlay off
            is_overlay = false;
        } else {
            is_overlay = true;
            current_tool = tool;
        }
        update_ui();
        change_page();
    }

    function toggle_canvas() {
        if (is_board) {
            is_board = false;
        }
        is_overlay = !is_overlay;
        update_ui();
        change_page();
    }

    function toggle_board() {
        is_board = !is_board;
        if (is_board) {
            is_overlay = false;
        }
        update_ui();
        change_page();
    }

    function set_color(idx) {
        color_idx = (idx + palette.length) % palette.length;
        update_ui();
    }

    function color_next() {
        set_color(color_idx + 1);
    }

    function color_prev() {
        set_color(color_idx - 1);
    }

    function clear() {
        if (project.activeLayer) {
            project.activeLayer.removeChildren();
            paper.view.draw();
        }
        laser_trail = [];
        if (laserCtx) {
            laserCtx.save();
            laserCtx.setTransform(1, 0, 0, 1, 0, 0);
            laserCtx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);
            laserCtx.restore();
        }
    }

    function download() {
        const link = document.createElement("a");
        link.download = `slide-whiteboard-${hash()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }

    // Attach button events
    penBtn.addEventListener("click", e => { e.stopPropagation(); select_tool("pen"); });
    markerBtn.addEventListener("click", e => { e.stopPropagation(); select_tool("marker"); });
    laserBtn.addEventListener("click", e => { e.stopPropagation(); select_tool("laser"); });
    boardBtn.addEventListener("click", e => { e.stopPropagation(); toggle_board(); });
    clearBtn.addEventListener("click", e => { e.stopPropagation(); clear(); });
    downloadBtn.addEventListener("click", e => { e.stopPropagation(); download(); });
    colorDots.forEach(dot => {
        dot.addEventListener("click", e => {
            e.stopPropagation();
            set_color(parseInt(dot.getAttribute("data-idx"), 10));
        });
    });

    function sync_palette_theme() {
        const theme = document.body ? (document.body.getAttribute("data-theme") || "sigma") : "sigma";
        const new_pal = THEME_PALETTES[theme] || THEME_PALETTES.sigma;
        for (let i = 0; i < new_pal.length && i < palette.length; i++) {
            palette[i].name = new_pal[i].name;
            palette[i].hex = new_pal[i].hex;
            if (colorDots[i]) {
                colorDots[i].style.background = new_pal[i].hex;
                colorDots[i].title = `${new_pal[i].name} (${i + 1})`;
            }
        }
        update_ui();
    }

    if (window.MutationObserver) {
        const themeObserver = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.attributeName === "data-theme") {
                    sync_palette_theme();
                    break;
                }
            }
        });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
    }
    sync_palette_theme();

    // Toolbar mouse hover handling for laser pointer
    toolbar.addEventListener("mouseenter", () => {
        laserDot.classList.remove("visible");
    });
    toolbar.addEventListener("mouseleave", () => {
        if ((is_overlay || is_board) && current_tool === "laser") {
            laserDot.classList.add("visible");
        }
    });

    // Vanishing laser trail animation loop
    function start_laser_loop() {
        if (!laser_anim_id) {
            laser_anim_id = requestAnimationFrame(render_laser);
        }
    }

    function render_laser() {
        const now = performance.now();
        // Prune expired points
        while (laser_trail.length > 0 && (now - laser_trail[0].time) >= TRAIL_DURATION) {
            laser_trail.shift();
        }

        const dpr = window.devicePixelRatio || 1;
        laserCtx.save();
        laserCtx.setTransform(1, 0, 0, 1, 0, 0);
        laserCtx.clearRect(0, 0, laserCanvas.width, laserCanvas.height);
        laserCtx.scale(dpr, dpr);

        if (laser_trail.length > 1) {
            const hex = get_current_color();
            const rgb = hexToRgb(hex) || { r: 220, g: 50, b: 47 };

            laserCtx.lineCap = "round";
            laserCtx.lineJoin = "round";

            // Pass 1: Soft outer halo (lightweight, zero shadowBlur)
            for (let i = 1; i < laser_trail.length; i++) {
                const p0 = laser_trail[i - 1];
                const p1 = laser_trail[i];
                const life = Math.max(0, 1 - (now - p1.time) / TRAIL_DURATION);
                if (life <= 0) continue;

                laserCtx.beginPath();
                laserCtx.moveTo(p0.x, p0.y);
                laserCtx.lineTo(p1.x, p1.y);
                laserCtx.lineWidth = 7 * life + 1;
                laserCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.35 * life})`;
                laserCtx.stroke();
            }

            // Pass 2: Focused core line
            for (let i = 1; i < laser_trail.length; i++) {
                const p0 = laser_trail[i - 1];
                const p1 = laser_trail[i];
                const life = Math.max(0, 1 - (now - p1.time) / TRAIL_DURATION);
                if (life <= 0) continue;

                laserCtx.beginPath();
                laserCtx.moveTo(p0.x, p0.y);
                laserCtx.lineTo(p1.x, p1.y);
                laserCtx.lineWidth = 2.5 * life + 0.5;
                laserCtx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.9 * life})`;
                laserCtx.stroke();
            }

            laserCtx.restore();
            laser_anim_id = requestAnimationFrame(render_laser);
        } else {
            laserCtx.restore();
            laser_anim_id = null;
        }
    }

    // Pointer coordinates helper
    function get_point(evt) {
        const rect = canvas.getBoundingClientRect();
        return new paper.Point(evt.clientX - rect.left, evt.clientY - rect.top);
    }

    function on_pointer_down(evt) {
        if (!is_overlay && !is_board) return;
        // Ignore left clicks on toolbar
        if (toolbar.contains(evt.target)) return;

        evt.preventDefault();

        // Laser pointer mode: click activated vanishing trail
        if (current_tool === "laser") {
            laser_drawing = true;
            laserDot.classList.add("pulsing");
            laser_trail.push({ x: evt.clientX, y: evt.clientY, time: performance.now() });
            start_laser_loop();
            return;
        }

        // Marker (Highlighter)
        if (current_tool === "marker") {
            const markerColor = new paper.Color(get_current_color());
            markerColor.alpha = 0.38; // Translucent highlighter ink
            active_path = new paper.Path({
                segments: [get_point(evt)],
                strokeColor: markerColor,
                strokeWidth: marker_stroke_width,
                strokeCap: "round",
                strokeJoin: "round"
            });
            return;
        }

        // Pen
        active_path = new paper.Path({
            segments: [get_point(evt)],
            strokeColor: get_current_color(),
            strokeWidth: pen_stroke_width,
            strokeCap: "round",
            strokeJoin: "round"
        });
    }

    function on_pointer_move(evt) {
        const is_active = is_overlay || is_board;
        if (!is_active) return;

        // Laser pointer: normal mode (visibility when mouse moves)
        if (current_tool === "laser") {
            laserDot.style.left = evt.clientX + "px";
            laserDot.style.top = evt.clientY + "px";

            if (!toolbar.contains(evt.target)) {
                laserDot.classList.add("visible");
            } else {
                laserDot.classList.remove("visible");
            }

            // Mode 2: click activated vanishing trail
            if (laser_drawing) {
                evt.preventDefault();
                const now = performance.now();
                if (laser_trail.length > 0) {
                    const last = laser_trail[laser_trail.length - 1];
                    const dist = Math.hypot(evt.clientX - last.x, evt.clientY - last.y);
                    if (dist > 16) {
                        laser_trail.push({
                            x: (last.x + evt.clientX) * 0.5,
                            y: (last.y + evt.clientY) * 0.5,
                            time: now
                        });
                    }
                }
                laser_trail.push({ x: evt.clientX, y: evt.clientY, time: now });
                start_laser_loop();
            }
            return;
        }

        // Pen / Marker drawing
        if (!active_path) return;
        evt.preventDefault();
        active_path.add(get_point(evt));
        paper.view.draw();
    }

    function on_pointer_up(evt) {
        if (current_tool === "laser") {
            laser_drawing = false;
            laserDot.classList.remove("pulsing");
            return;
        }

        if (active_path) {
            if (current_tool === "marker") {
                active_path.simplify(10);
            } else {
                active_path.simplify(8);
            }
            active_path = null;
            paper.view.draw();
        }
    }

    canvas.addEventListener("mousedown", on_pointer_down);
    window.addEventListener("mousemove", on_pointer_move);
    window.addEventListener("mouseup", on_pointer_up);

    window.addEventListener("mouseleave", () => {
        laserDot.classList.remove("visible");
        if (laser_drawing) {
            laser_drawing = false;
            laserDot.classList.remove("pulsing");
        }
    });

    // Touch support for iPad / touch displays
    canvas.addEventListener("touchstart", e => {
        if (e.touches.length === 1) on_pointer_down(e.touches[0]);
    }, { passive: false });
    window.addEventListener("touchmove", e => {
        if (e.touches.length === 1) on_pointer_move(e.touches[0]);
    }, { passive: false });
    window.addEventListener("touchend", e => {
        on_pointer_up(e);
    });

    // Resize handling
    window.addEventListener("resize", () => {
        paper.view.viewSize = new paper.Size(window.innerWidth, window.innerHeight);
        resize_laser_canvas();
    });

    // Reveal.js event hooks
    Reveal.on("slidechanged", () => change_page());
    Reveal.on("fragmentshown", () => change_page());
    Reveal.on("fragmenthidden", () => change_page());

    // Register Key Bindings with Reveal
    Reveal.addKeyBinding({ keyCode: 80, key: 'P', description: 'Select Pen Tool' }, () => select_tool('pen'));
    Reveal.addKeyBinding({ keyCode: 77, key: 'M', description: 'Select Marker Tool' }, () => select_tool('marker'));
    Reveal.addKeyBinding({ keyCode: 76, key: 'L', description: 'Select Laser Pointer Tool' }, () => select_tool('laser'));
    Reveal.addKeyBinding({ keyCode: 67, key: 'C', description: 'Toggle Drawing Canvas' }, toggle_canvas);
    Reveal.addKeyBinding({ keyCode: 66, key: 'B', description: 'Toggle Blank Blackboard' }, toggle_board);
    Reveal.addKeyBinding({ keyCode: 88, key: 'X', description: 'Next Color' }, color_next);
    Reveal.addKeyBinding({ keyCode: 89, key: 'Y', description: 'Previous Color' }, color_prev);
    Reveal.addKeyBinding({ keyCode: 46, key: 'DEL', description: 'Clear Drawings on Slide' }, clear);
    Reveal.addKeyBinding({ keyCode: 8, key: 'BACKSPACE', description: 'Clear Drawings on Slide' }, clear);
    Reveal.addKeyBinding({ keyCode: 68, key: 'D', description: 'Download Slide Drawing' }, download);

    // ESC closes drawing, laser or blank board
    window.addEventListener("keydown", e => {
        if (e.key === "Escape" && (is_overlay || is_board)) {
            is_overlay = false;
            is_board = false;
            update_ui();
            change_page();
            e.stopPropagation();
        }
    }, true);

    // Export internal controller
    window._wb = {
        select_tool,
        toggle_canvas,
        toggle_board,
        color_next,
        color_prev,
        set_color,
        clear,
        download,
        get_tool: () => current_tool
    };

    update_ui();
    change_page();
};
