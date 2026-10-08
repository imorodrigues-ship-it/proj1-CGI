#version 300 es

precision highp float;

uniform bool u_draw_points;

in vec4 v_color;
out vec4 color;

void main() {
    if (u_draw_points) {
        color = v_color;
    } else {
        color = vec4(0.2f, 0.4f, 0.6f, 1.0f);
    }
}
