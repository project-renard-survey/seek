/*
 Some cystoscape functions are overiden here, in order to:
 - Fix bugs
 - Change the default behavior which can not do through api or configuration
 */

;
(function ($$) {
    'use strict';

    var defaults = {
        fit: true, // whether to fit the viewport to the graph
        directed: false, // whether the tree is directed downwards (or edges can point in any direction if false)
        padding: 30, // padding on fit
        circle: false, // put depths in concentric circles if true, put depths top down if false
        spacingFactor: 1.75, // positive spacing factor, larger => more space between nodes (N.B. n/a if causes overlap)
        boundingBox: undefined, // constrain layout bounds; { x1, y1, x2, y2 } or { x1, y1, w, h }
        avoidOverlap: true, // prevents node overlap, may overflow boundingBox if not enough space
        roots: undefined, // the roots of the trees
        maximalAdjustments: 0, // how many times to try to position the nodes in a maximal way (i.e. no backtracking)
        animate: false, // whether to transition the node positions
        animationDuration: 500, // duration of animation in ms if enabled
        ready: undefined, // callback on layoutready
        stop: undefined // callback on layoutstop
    };

    function BreadthFirstLayout(options) {
        this.options = $$.util.extend({}, defaults, options);
    }

    BreadthFirstLayout.prototype.run = function () {
        var params = this.options;
        var options = params;

        var cy = params.cy;
        var eles = options.eles;
        var nodes = eles.nodes().not(':parent');
        var graph = eles;
        var container = cy.container();

        var bb = $$.util.makeBoundingBox(options.boundingBox ? options.boundingBox : {
            x1: 0, y1: 0, w: cy.width(), h: cy.height()
        });

        var roots;
        if ($$.is.elementOrCollection(options.roots)) {
            roots = options.roots;
        } else if ($$.is.array(options.roots)) {
            var rootsArray = [];

            for (var i = 0; i < options.roots.length; i++) {
                var id = options.roots[i];
                var ele = cy.getElementById(id);
                rootsArray.push(ele);
            }

            roots = new $$.Collection(cy, rootsArray);
        } else if ($$.is.string(options.roots)) {
            roots = cy.$(options.roots);

        } else {
            if (options.directed) {
                roots = nodes.roots();
            } else {
                var components = [];
                var unhandledNodes = nodes;

                while (unhandledNodes.length > 0) {
                    var currComp = cy.collection();

                    eles.bfs({
                        roots: unhandledNodes[0],
                        visit: function (i, depth, node, edge, pNode) {
                            currComp = currComp.add(node);
                        },
                        directed: false
                    });

                    unhandledNodes = unhandledNodes.not(currComp);
                    components.push(currComp);
                }

                roots = cy.collection();
                for (var i = 0; i < components.length; i++) {
                    var comp = components[i];
                    var maxDegree = comp.maxDegree(false);
                    var compRoots = comp.filter(function () {
                        return this.degree(false) === maxDegree;
                    });

                    roots = roots.add(compRoots);
                }

            }
        }


        var depths = [];
        var foundByBfs = {};
        var id2depth = {};
        var prevNode = {};
        var prevEdge = {};
        var successors = {};

        // find the depths of the nodes
        graph.bfs({
            roots: roots,
            directed: options.directed,
            visit: function (i, depth, node, edge, pNode) {
                var ele = this[0];
                var id = ele.id();

                if (!depths[depth]) {
                    depths[depth] = [];
                }

                depths[depth].push(ele);
                foundByBfs[id] = true;
                id2depth[id] = depth;
                prevNode[id] = pNode;
                prevEdge[id] = edge;

                if (pNode) {
                    var prevId = pNode.id();
                    var succ = successors[prevId] = successors[prevId] || [];

                    succ.push(node);
                }
            }
        });

        // check for nodes not found by bfs
        var orphanNodes = [];
        for (var i = 0; i < nodes.length; i++) {
            var ele = nodes[i];

            if (foundByBfs[ele.id()]) {
                continue;
            } else {
                orphanNodes.push(ele);
            }
        }

        // assign orphan nodes a depth from their neighborhood
        var maxChecks = orphanNodes.length * 3;
        var checks = 0;
        while (orphanNodes.length !== 0 && checks < maxChecks) {
            var node = orphanNodes.shift();
            var neighbors = node.neighborhood().nodes();
            var assignedDepth = false;

            for (var i = 0; i < neighbors.length; i++) {
                var depth = id2depth[neighbors[i].id()];

                if (depth !== undefined) {
                    depths[depth].push(node);
                    assignedDepth = true;
                    break;
                }
            }

            if (!assignedDepth) {
                orphanNodes.push(node);
            }

            checks++;
        }

        // assign orphan nodes that are still left to the depth of their subgraph
        while (orphanNodes.length !== 0) {
            var node = orphanNodes.shift();
            //var subgraph = graph.bfs( node ).path;
            var assignedDepth = false;

            // for( var i = 0; i < subgraph.length; i++ ){
            //   var depth = id2depth[ subgraph[i].id() ];

            //   if( depth !== undefined ){
            //     depths[depth].push( node );
            //     assignedDepth = true;
            //     break;
            //   }
            // }

            if (!assignedDepth) { // worst case if the graph really isn't tree friendly, then just dump it in 0
                if (depths.length === 0) {
                    depths.push([]);
                }

                depths[0].push(node);
            }
        }

        // assign the nodes a depth and index
        var assignDepthsToEles = function () {
            for (var i = 0; i < depths.length; i++) {
                var eles = depths[i];

                for (var j = 0; j < eles.length; j++) {
                    var ele = eles[j];

                    ele._private.scratch.breadthfirst = {
                        depth: i,
                        index: j
                    };
                }
            }
        };
        assignDepthsToEles();


        var intersectsDepth = function (node) { // returns true if has edges pointing in from a higher depth
            var edges = node.connectedEdges(function () {
                return this.data('target') === node.id();
            });
            var thisInfo = node._private.scratch.breadthfirst;
            var highestDepthOfOther = 0;
            var highestOther;
            for (var i = 0; i < edges.length; i++) {
                var edge = edges[i];
                var otherNode = edge.source()[0];
                var otherInfo = otherNode._private.scratch.breadthfirst;

                if (thisInfo.depth <= otherInfo.depth && highestDepthOfOther < otherInfo.depth) {
                    highestDepthOfOther = otherInfo.depth;
                    highestOther = otherNode;
                }
            }

            return highestOther;
        };

        // make maximal if so set by adjusting depths
        for (var adj = 0; adj < options.maximalAdjustments; adj++) {

            var nDepths = depths.length;
            var elesToMove = [];
            for (var i = 0; i < nDepths; i++) {
                var depth = depths[i];

                var nDepth = depth.length;
                for (var j = 0; j < nDepth; j++) {
                    var ele = depth[j];
                    var info = ele._private.scratch.breadthfirst;
                    var intEle = intersectsDepth(ele);

                    if (intEle) {
                        info.intEle = intEle;
                        elesToMove.push(ele);
                    }
                }
            }

            for (var i = 0; i < elesToMove.length; i++) {
                var ele = elesToMove[i];
                var info = ele._private.scratch.breadthfirst;
                var intEle = info.intEle;
                var intInfo = intEle._private.scratch.breadthfirst;

                depths[info.depth].splice(info.index, 1); // remove from old depth & index

                // add to end of new depth
                var newDepth = intInfo.depth + 1;
                while (newDepth > depths.length - 1) {
                    depths.push([]);
                }
                depths[newDepth].push(ele);

                info.depth = newDepth;
                info.index = depths[newDepth].length - 1;
            }

            assignDepthsToEles();
        }

        // find min distance we need to leave between nodes
        var minDistance = 0;
        if (options.avoidOverlap) {
            for (var i = 0; i < nodes.length; i++) {
                var w = nodes[i].outerWidth();
                var h = nodes[i].outerHeight();

                minDistance = Math.max(minDistance, w, h);
            }
            minDistance *= options.spacingFactor; // just to have some nice spacing
        }

        // get the weighted percent for an element based on its connectivity to other levels
        var cachedWeightedPercent = {};
        var getWeightedPercent = function (ele) {
            if (cachedWeightedPercent[ele.id()]) {
                return cachedWeightedPercent[ele.id()];
            }

            var eleDepth = ele._private.scratch.breadthfirst.depth;
            var neighbors = ele.neighborhood().nodes().not(':parent');
            var percent = 0;
            var samples = 0;

            for (var i = 0; i < neighbors.length; i++) {
                var neighbor = neighbors[i];
                var bf = neighbor._private.scratch.breadthfirst;
                var index = bf.index;
                var depth = bf.depth;
                var nDepth = depths[depth].length;

                if (eleDepth > depth || eleDepth === 0) { // only get influenced by elements above
                    percent += index / nDepth;
                    samples++;
                }
            }

            samples = Math.max(1, samples);
            percent = percent / samples;

            if (samples === 0) { // so lone nodes have a "don't care" state in sorting
                percent = undefined;
            }

            cachedWeightedPercent[ele.id()] = percent;
            return percent;
        };


        // rearrange the indices in each depth level based on connectivity

        var sortFn = function (a, b) {
            var apct = getWeightedPercent(a);
            var bpct = getWeightedPercent(b);

            return apct - bpct;
        };

        for (var times = 0; times < 3; times++) { // do it a few times b/c the depths are dynamic and we want a more stable result

            for (var i = 0; i < depths.length; i++) {
                depths[i] = depths[i].sort(sortFn);
            }
            assignDepthsToEles(); // and update

        }

        var biggestDepthSize = 0;
        for (var i = 0; i < depths.length; i++) {
            biggestDepthSize = Math.max(depths[i].length, biggestDepthSize);
        }

        var center = {
            //x: bb.x1 + bb.w/2,
            //y: bb.x1 + bb.h/2
            x: width / 2,
            y: height / 2
        };

        var getPosition = function (ele, isBottomDepth) {
            var info = ele._private.scratch.breadthfirst;
            var depth = info.depth;
            var index = info.index;
            var depthSize = depths[depth].length;

            //var distanceX = Math.max( bb.w / (depthSize + 1), minDistance );
            //var distanceY = Math.max( bb.h / (depths.length + 1), minDistance );

            var width = container.clientWidth;
            //calculate the height dynamically
            var height = graphHeight();
            container.style.height = height + 'px';

            function graphHeight() {
                var max_index = 0;
                for (var i = 0; i < depths.length; i++) {
                    max_index = Math.max(depths[i].length, max_index);
                }
                return (2 * max_index + 1) * nodes[0].outerHeight();
            }

            var distanceX = Math.max(width / (depths.length + 1), minDistance);
            var distanceY = height / (depths[depth].length + 1);

            var radiusStepSize = Math.min(bb.w / 2 / depths.length, bb.h / 2 / depths.length);
            radiusStepSize = Math.max(radiusStepSize, minDistance);

            if (!options.circle) {

                var epos = {
                    //x: center.x + (index + 1 - (depthSize + 1)/2) * distanceX,
                    //y: (depth + 1) * distanceY
                    y: (index + 1) * distanceY,
                    x: (depth + 1) * distanceX
                };

                if (isBottomDepth) {
                    return epos;
                }

                // var succs = successors[ ele.id() ];
                // if( succs ){
                //   epos.x = 0;
                //
                //   for( var i = 0 ; i < succs.length; i++ ){
                //     var spos = pos[ succs[i].id() ];
                //
                //     epos.x += spos.x;
                //   }
                //
                //   epos.x /= succs.length;
                // } else {
                //   //debugger;
                // }

                return epos;

            } else {
                if (options.circle) {
                    var radius = radiusStepSize * depth + radiusStepSize - (depths.length > 0 && depths[0].length <= 3 ? radiusStepSize / 2 : 0);
                    var theta = 2 * Math.PI / depths[depth].length * index;

                    if (depth === 0 && depths[0].length === 1) {
                        radius = 1;
                    }

                    return {
                        x: center.x + radius * Math.cos(theta),
                        y: center.y + radius * Math.sin(theta)
                    };

                } else {
                    return {
                        x: center.x + (index + 1 - (depthSize + 1) / 2) * distanceX,
                        y: (depth + 1) * distanceY
                    };
                }
            }

        };

        // get positions in reverse depth order
        var pos = {};
        for (var i = depths.length - 1; i >= 0; i--) {
            var depth = depths[i];

            for (var j = 0; j < depth.length; j++) {
                var node = depth[j];

                pos[node.id()] = getPosition(node, i === depths.length - 1);
            }
        }

        nodes.layoutPositions(this, options, function () {
            return pos[this.id()];
        });

        return this; // chaining
    };

    $$('layout', 'breadthfirst', BreadthFirstLayout);

    // Change the dault value for SEEK, it looks better with 6 instead of 10
    $$.math.getRoundRectangleRadius = function (width, height) {
        return Math.min(width / 2, height / 2, 6);
    }

    // Fix the safari 6.1 and above quits unexpectedly
    $$.math.roundRectangleIntersectLine = function (x, y, nodeX, nodeY, width, height, padding) {

        //change for seek
        //var cornerRadius = this.getRoundRectangleRadius(width, height);
        var cornerRadius = 0;

        var halfWidth = width / 2;
        var halfHeight = height / 2;

        // Check intersections with straight line segments
        var straightLineIntersections;

        // Top segment, left to right
        {
            var topStartX = nodeX - halfWidth + cornerRadius - padding;
            var topStartY = nodeY - halfHeight - padding;
            var topEndX = nodeX + halfWidth - cornerRadius + padding;
            var topEndY = topStartY;

            straightLineIntersections = this.finiteLinesIntersect(
                x, y, nodeX, nodeY, topStartX, topStartY, topEndX, topEndY, false);

            if (straightLineIntersections.length > 0) {
                return straightLineIntersections;
            }
        }

        // Right segment, top to bottom
        {
            var rightStartX = nodeX + halfWidth + padding;
            var rightStartY = nodeY - halfHeight + cornerRadius - padding;
            var rightEndX = rightStartX;
            var rightEndY = nodeY + halfHeight - cornerRadius + padding;

            straightLineIntersections = this.finiteLinesIntersect(
                x, y, nodeX, nodeY, rightStartX, rightStartY, rightEndX, rightEndY, false);

            if (straightLineIntersections.length > 0) {
                return straightLineIntersections;
            }
        }

        // Bottom segment, left to right
        {
            var bottomStartX = nodeX - halfWidth + cornerRadius - padding;
            var bottomStartY = nodeY + halfHeight + padding;
            var bottomEndX = nodeX + halfWidth - cornerRadius + padding;
            var bottomEndY = bottomStartY;

            straightLineIntersections = this.finiteLinesIntersect(
                x, y, nodeX, nodeY, bottomStartX, bottomStartY, bottomEndX, bottomEndY, false);

            if (straightLineIntersections.length > 0) {
                return straightLineIntersections;
            }
        }

        // Left segment, top to bottom
        {
            var leftStartX = nodeX - halfWidth - padding;
            var leftStartY = nodeY - halfHeight + cornerRadius - padding;
            var leftEndX = leftStartX;
            var leftEndY = nodeY + halfHeight - cornerRadius + padding;

            straightLineIntersections = this.finiteLinesIntersect(
                x, y, nodeX, nodeY, leftStartX, leftStartY, leftEndX, leftEndY, false);

            if (straightLineIntersections.length > 0) {
                return straightLineIntersections;
            }
        }

        // Check intersections with arc segments
        var arcIntersections;

        // Top Left
        {
            var topLeftCenterX = nodeX - halfWidth + cornerRadius;
            var topLeftCenterY = nodeY - halfHeight + cornerRadius;
            arcIntersections = this.intersectLineCircle(
                x, y, nodeX, nodeY,
                topLeftCenterX, topLeftCenterY, cornerRadius + padding);

            // Ensure the intersection is on the desired quarter of the circle
            if (arcIntersections.length > 0
                && arcIntersections[0] <= topLeftCenterX
                && arcIntersections[1] <= topLeftCenterY) {
                return [arcIntersections[0], arcIntersections[1]];
            }
        }

        // Top Right
        {
            var topRightCenterX = nodeX + halfWidth - cornerRadius;
            var topRightCenterY = nodeY - halfHeight + cornerRadius;
            arcIntersections = this.intersectLineCircle(
                x, y, nodeX, nodeY,
                topRightCenterX, topRightCenterY, cornerRadius + padding);

            // Ensure the intersection is on the desired quarter of the circle
            if (arcIntersections.length > 0
                && arcIntersections[0] >= topRightCenterX
                && arcIntersections[1] <= topRightCenterY) {
                return [arcIntersections[0], arcIntersections[1]];
            }
        }

        // Bottom Right
        {
            var bottomRightCenterX = nodeX + halfWidth - cornerRadius;
            var bottomRightCenterY = nodeY + halfHeight - cornerRadius;
            arcIntersections = this.intersectLineCircle(
                x, y, nodeX, nodeY,
                bottomRightCenterX, bottomRightCenterY, cornerRadius + padding);

            // Ensure the intersection is on the desired quarter of the circle
            if (arcIntersections.length > 0
                && arcIntersections[0] >= bottomRightCenterX
                && arcIntersections[1] >= bottomRightCenterY) {
                return [arcIntersections[0], arcIntersections[1]];
            }
        }

        // Bottom Left
        {
            var bottomLeftCenterX = nodeX - halfWidth + cornerRadius;
            var bottomLeftCenterY = nodeY + halfHeight - cornerRadius;
            arcIntersections = this.intersectLineCircle(
                x, y, nodeX, nodeY,
                bottomLeftCenterX, bottomLeftCenterY, cornerRadius + padding);

            // Ensure the intersection is on the desired quarter of the circle
            if (arcIntersections.length > 0
                && arcIntersections[0] <= bottomLeftCenterX
                && arcIntersections[1] >= bottomLeftCenterY) {
                return [arcIntersections[0], arcIntersections[1]];
            }
        }

        return []; // if nothing
    };
})(cytoscape);

