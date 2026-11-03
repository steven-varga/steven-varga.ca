

let Whiteboard = {
	id: "whiteboard",
	init: function(deck) {
        init_whiteboard(deck);
    },
	toggle_canvas: function() { toggle_canvas(); },
    toggle_board: function() { toggle_board(); },
    color_next: function() { color_next(); },
    color_prev: function() {color_prev(); },
    clear: function() { clear(); },
    reset: function() { reset(); },
    reset_all: function() { reset_all(); },
    download: function() { download(); },
}

const init_whiteboard = function(Reveal){
	const layers = new Map();
	var canvas = document.getElementById("whiteboard"),
		path, is_overlay=false,
		key_bindings = { 
			toggle_canvas: { keyCode: 67, key: 'C', description: 'Toggle notes canvas' },
			toggle_board: { keyCode: 66, key: 'B', description: 'Toggle chalkboard' },
			color_prev: { keyCode: 89, key: 'Y', description: 'Previous color' },
			color_next: { keyCode: 88, key: 'X', description: 'Next color' },
			clear: { keyCode: 171, key: '+', description: 'Clear drawings on slide' },
			reset: { keyCode: 46, key: 'DEL', description: 'Reset drawings on slide' },
			reset_all: { keyCode: 8, key: 'BACKSPACE', description: 'Reset all drawings' },
			download: { keyCode: 68, key: 'D', description: 'Download drawings' }
		};
	paper.setup(canvas);
	
	var project = paper.project;
	project.addLayer(new paper.Layer());
	
	/** changes/activates a page provided the canvas is enabled
	 */
	function change_page(){
		var page_id = hash(true), 
			layer = undefined;
		// if there is no layer associated with the current page
		// we create one
		project.activeLayer.visible = false;
		if(!layers.has(page_id)) {
			if(!is_overlay) return;
			layer = new paper.Layer();
			layers.set(page_id, layer);
			project.addLayer(layer); // becomes the active layer
		} else 
			layer = layers.get(page_id);
		layer.activate();
		layer.visible = true;
	}
	/** keyboard callbacks*/
	this.toggle_canvas= ()=> {is_overlay = !is_overlay; change_page();}; 
	this.toggle_board= ()=>{};
	this.color_prev=   ()=>{};
	this.color_next=   ()=>{};
	this.clear=        ()=>{};
	this.reset=        ()=>{};
	this.reset_all=    ()=>{};
	this.download=     ()=>{};

	for (var key in key_bindings) {
		if ( key_bindings[key] ) {
			Reveal.addKeyBinding( key_bindings[key], Whiteboard[key] );
		}
	};

	/**
	 * Elements below the canvas may be activated with mouse click
	 * this function turns this property off
	 */
	function make_unselectable(node) {
		if (node.nodeType == 1) {
			node.setAttribute("unselectable", "on");
		}
		var child = node.firstChild;
		while (child) {
			makeUnselectable(child);
			child = child.nextSibling;
		}
	}
	/** return an integer as function of index
	 * 31bits available, we break it into three sections
	 * fragments, horizontal slides, vertical slides
	 * @param  {bool} is_overlay
	 */
	function hash(is_overlay){
		i = Reveal.getIndices() // get index
		return 1 + (i.f ? i.f : 0) + (i.h << 5) + (i.v << 15);
	}

	document.addEventListener( 'mousedown', function( evt ) {
		if(path){
			path.selected = false;
		}
		path = new paper.Path();
		path.strokeColor = "orange";
		path.fullySelected = false;
	});

	document.addEventListener( 'mousemove', function( evt ) {
		if(path && is_overlay){
			path.add(new paper.Point(evt.clientX, evt.clientY));
		}
	});
	
	document.addEventListener( 'mouseup', function( evt ) {
		if ( path ) {
			path.simplify(10);
			path.fullySelected = false;
			path = null;
		}
	});
	
	window.addEventListener( "resize", function() {
	});
	
	Reveal.on( 'ready', event => {
		if(!path){
			path = new paper.Path();
		}
	});
	Reveal.on('slidechanged', event => change_page());
	Reveal.on('fragmentshown', event => change_page());
	Reveal.on('fragmenthidden', event => change_page());

	return this;
}
 