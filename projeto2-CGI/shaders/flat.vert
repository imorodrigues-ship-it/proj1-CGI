#version 300 es

layout(location = 0) in vec4 a_position;

uniform mat4 u_model_view;
uniform mat4 u_projection;

void main() {
    gl_Position = u_projection * u_model_view * a_position;
}
