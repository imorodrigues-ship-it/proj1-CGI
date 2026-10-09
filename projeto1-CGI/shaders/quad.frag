#version 300 es

precision highp float;

uniform bool u_points;
uniform bool u_in;
uniform vec4 u_color;
in vec4 v_color;
out vec4 color;

void main() {
    if (!u_points) {
        color = vec4(0.2f, 0.4f, 0.6f, 1.0f);
    } else {
        if (distance(gl_PointCoord, vec2(0.5, 0.5)) > 0.5) {
            discard;
        }
        if (u_in) {
            color = v_color;
        } else color = u_color;
    }
}
