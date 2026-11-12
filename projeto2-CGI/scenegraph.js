import { mult, translate, rotateX, rotateY, rotateZ, scalem } from "../../libs/MV.js";
import * as STACK from "../../libs/stack.js";

/**
 * A scene graph made of plain javascript objects.
 *
 * Every node has a name and a transformation, given by a scale, three
 * rotations (degrees) and a translation, applied to a point P in the order
 *
 *     T . Rz . Ry . Rx . S . P
 *
 * A leaf also has a primitive (a geometry and a colour); an internal node
 * has children. Every node knows its parent, so that the chain of
 * transformations from the root down to any node can be followed.
 *
 * Still to write (see the project description):
 *  - world(n): from the node's coordinate system to the world's;
 *  - to_local(n, p): a point given in world coordinates, seen from the node;
 *  - moving a node under a new parent.
 */

export function node(name, { t = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}, children = []) {
    const n = {
        name: name,
        transform: { scale: s, rotation: r, translation: t },
        children: children,
        parent: null
    };
    children.forEach(c => c.parent = n);
    return n;
}

export function leaf(name, geometry, colour, trs = {}) {
    const n = node(name, trs);
    n.primitive = { geometry: geometry, colour: colour };
    return n;
}

// The node's own transformation, from its coordinate system to its parent's
export function transform(n) {
    const { scale: s, rotation: r, translation: t } = n.transform;
    return mult(translate(t), mult(rotateZ(r[2]), mult(rotateY(r[1]), mult(rotateX(r[0]), scalem(s)))));
}

export function find(root, name) {
    if (root.name == name) return root;
    for (const c of root.children) {
        const found = find(c, name);
        if (found) return found;
    }
    return null;
}

export function count_primitives(n) {
    return (n.primitive ? 1 : 0) + n.children.reduce((sum, c) => sum + count_primitives(c), 0);
}

/**
 * Walks the graph from n down, keeping the current transformation on the
 * matrix stack: each node appends its own and its children inherit it.
 * draw_primitive(primitive, mv) is called for every leaf, with the
 * model-view matrix of that leaf.
 *
 * A child must not leave its transformation behind for the siblings that
 * come after it, so the current matrix is pushed before visiting a child and
 * popped after. The last child has no siblings after it, and once it is done
 * nobody needs this node's matrix any more: it needs no push and no pop.
 * The current matrix is therefore left changed when draw() returns; push
 * and pop around the call if you still need it.
 */
export function draw(n, draw_primitive) {
    STACK.multMatrix(transform(n));
    if (n.primitive)
        draw_primitive(n.primitive, STACK.modelView());
    const last = n.children.length - 1;
    n.children.forEach((c, i) => {
        if (i < last) {
            STACK.pushMatrix();
            draw(c, draw_primitive);
            STACK.popMatrix();
        }
        else
            draw(c, draw_primitive);
    });
}
