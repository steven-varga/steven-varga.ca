    var path;
    var myCircle = new Path.Circle(new Point(100, 70), 50);
    myCircle.fillColor = 'olive';
    
    function onMouseDown(event) {
        if (path) {
            path.selected = false;
        }
        
        path = new Path();
        path.strokeColor = 'orange';
        console.log("mouse down..")
    }
    
    function onMouseDrag(event) {
        path.add(event.point);
    }
    
    function onMouseUp(event) {
        path.simplify(20);
        path.fullySelected = false;
    }
    /*
    */