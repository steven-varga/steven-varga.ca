/**
 * Whiteboard plugin for Reveal.js using Paper.js
 * High-performance vector drawing layer for notes on slides and full blank chalkboard.
 */

let Whiteboard = {
    id: "whiteboard",
    init: function(deck) {
        init_whiteboard(deck);
    },
    toggle_canvas: function() { if (window._wb) window._wb.toggle_canvas(); },
    toggle_board: function() { if (window._wb) window._wb.toggle_board(); },
    color_next: function() { if (window._wb) window._wb.color_next(); },
    color_prev: function() { if (window._wb) window._wb.color_prev(); },
    clear: function() { if (window._wb) window._wb.clear(); },
    download: function() { if (window._wb) window._wb.download(); },
};

const init_whiteboard = function(Reveal) {
    const palette = [
        { name: "Orange", hex: "#cb4b16" },
        { name: "Blue", hex: "#268bd2" },
        { name: "Green", hex: "#859900" },
        { name: "Red", hex: "#dc322f" },
        { name: "Yellow", hex: "#b58900" },
        { name: "Cyan", hex: "#2aa198" },
        { name: "White", hex: "#ffffff" }
    ];

    let color_idx = 0;
    let stroke_width = 3.5;
    let is_overlay = false;
    let is_board = false;
    let active_path = null;
    const layers = new Map();

    const canvas = document.getElementById("whiteboard");
    if (!canvas) {
        console.warn("Whiteboard: canvas element #whiteboard not found");
        return;
    }

    // Initialize Paper.js on canvas
    paper.setup(canvas);
    const project = paper.project;

    // Create toolbar UI
    const toolbar = document.createElement("div");
    toolbar.className = "whiteboard-toolbar";
    toolbar.innerHTML = `
        <button class="wb-btn wb-pen-btn" title="Toggle Drawing Layer (C)"><i class="fas fa-pen"></i><span class="wb-color-badge" style="background:${palette[0].hex};"></span></button>
        <button class="wb-btn wb-board-btn" title="Toggle Blank Board (B)"><i class="fas fa-chalkboard"></i></button>
        <div class="wb-palette">
            ${palette.map((c, i) => `<button class="wb-color-dot ${i === 0 ? 'active' : ''}" data-idx="${i}" style="background:${c.hex};" title="${c.name} (X/Y)"></button>`).join('')}
        </div>
        <button class="wb-btn wb-clear-btn" title="Clear Slide Drawings (DEL)"><i class="fas fa-trash-alt"></i></button>
        <button class="wb-btn wb-download-btn" title="Save Drawing (D)"><i class="fas fa-download"></i></button>
    `;
    document.body.appendChild(toolbar);

    const penBtn = toolbar.querySelector(".wb-pen-btn");
    const boardBtn = toolbar.querySelector(".wb-board-btn");
    const clearBtn = toolbar.querySelector(".wb-clear-btn");
    const downloadBtn = toolbar.querySelector(".wb-download-btn");
    const colorBadge = toolbar.querySelector(".wb-color-badge");
    const colorDots = toolbar.querySelectorAll(".wb-color-dot");

    function get_current_color() {
        return palette[color_idx].hex;
    }

    function update_ui() {
        if (is_overlay || is_board) {
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

        if (is_overlay) {
            penBtn.classList.add("active");
        } else {
            penBtn.classList.remove("active");
        }

        colorBadge.style.backgroundColor = get_current_color();
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
    }

    function download() {
        const link = document.createElement("a");
        link.download = `slide-whiteboard-${hash()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    }

    // Attach button events
    penBtn.addEventListener("click", e => { e.stopPropagation(); toggle_canvas(); });
    boardBtn.addEventListener("click", e => { e.stopPropagation(); toggle_board(); });
    clearBtn.addEventListener("click", e => { e.stopPropagation(); clear(); });
    downloadBtn.addEventListener("click", e => { e.stopPropagation(); download(); });
    colorDots.forEach(dot => {
        dot.addEventListener("click", e => {
            e.stopPropagation();
            set_color(parseInt(dot.getAttribute("data-idx"), 10));
        });
    });

    // Pointer drawing logic
    function get_point(evt) {
        const rect = canvas.getBoundingClientRect();
        return new paper.Point(evt.clientX - rect.left, evt.clientY - rect.top);
    }

    function on_pointer_down(evt) {
        if (!is_overlay && !is_board) return;
        // Ignore left clicks on toolbar
        if (toolbar.contains(evt.target)) return;

        evt.preventDefault();
        active_path = new paper.Path({
            segments: [get_point(evt)],
            strokeColor: get_current_color(),
            strokeWidth: stroke_width,
            strokeCap: "round",
            strokeJoin: "round"
        });
    }

    function on_pointer_move(evt) {
        if ((!is_overlay && !is_board) || !active_path) return;
        evt.preventDefault();
        active_path.add(get_point(evt));
        paper.view.draw();
    }

    function on_pointer_up(evt) {
        if (active_path) {
            active_path.simplify(8);
            active_path = null;
            paper.view.draw();
        }
    }

    canvas.addEventListener("mousedown", on_pointer_down);
    window.addEventListener("mousemove", on_pointer_move);
    window.addEventListener("mouseup", on_pointer_up);

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
    });

    // Reveal.js event hooks
    Reveal.on("slidechanged", () => change_page());
    Reveal.on("fragmentshown", () => change_page());
    Reveal.on("fragmenthidden", () => change_page());

    // Register Key Bindings with Reveal
    Reveal.addKeyBinding({ keyCode: 67, key: 'C', description: 'Toggle Whiteboard Canvas' }, toggle_canvas);
    Reveal.addKeyBinding({ keyCode: 66, key: 'B', description: 'Toggle Blank Blackboard' }, toggle_board);
    Reveal.addKeyBinding({ keyCode: 88, key: 'X', description: 'Next Pen Color' }, color_next);
    Reveal.addKeyBinding({ keyCode: 89, key: 'Y', description: 'Previous Pen Color' }, color_prev);
    Reveal.addKeyBinding({ keyCode: 46, key: 'DEL', description: 'Clear Drawings on Slide' }, clear);
    Reveal.addKeyBinding({ keyCode: 8, key: 'BACKSPACE', description: 'Clear Drawings on Slide' }, clear);
    Reveal.addKeyBinding({ keyCode: 68, key: 'D', description: 'Download Slide Drawing' }, download);

    // ESC closes drawing or blank board
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
        toggle_canvas,
        toggle_board,
        color_next,
        color_prev,
        set_color,
        clear,
        download
    };

    update_ui();
    change_page();
};
