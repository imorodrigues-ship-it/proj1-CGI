#version 300 es

#define BIG_FLOAT 1000000.0
#define MAX_SITES 32

precision highp float;

//uniforms related to distance
uniform int u_distance;
uniform float u_scale;
uniform float u_world_half_width;
uniform vec2 u_canvas;
uniform vec2 u_center;

//uniforms related to site and color infos
uniform int u_numsites;
uniform bool u_isborderon;
uniform vec2 u_sites[MAX_SITES];
uniform vec4 u_colors[MAX_SITES];

out vec4 color;

void main() {
  if(u_numsites == 0) {
    color = vec4(0.2f, 0.4f, 0.6f, 1.0f);
    return;
  }

  float nx = (gl_FragCoord.x / u_canvas.x) * 2.0f - 1.0f;
  float ny = (gl_FragCoord.y / u_canvas.y) * 2.0f - 1.0f;
  float aspect = u_canvas.y / u_canvas.x;

  vec2 world_coord = vec2(nx, ny * aspect) * u_world_half_width * u_scale + u_center;

  float best = BIG_FLOAT;
  float second = BIG_FLOAT;
  int bestIdx = -1;
  float d;
  for(int i = 0; i < u_numsites; i++) {
    vec2 curr = abs(world_coord - u_sites[i]);

    if(u_distance == 0)
      d = distance(world_coord, u_sites[i]);
    else if(u_distance == 1)
      d = curr.x + curr.y;
    else
      d = max(curr.x, curr.y);

    if(d < best) {
      second = best;
      best = d;
      bestIdx = i;
    } else if(d < second)
      second = d;
  }

  float threshold = 5.0f * u_scale * u_world_half_width / u_canvas.x;
  if(u_isborderon && (second - best) < threshold)
    color = vec4(1.0f, 1.0f, 1.0f, 1.0f);
  else
    color = u_colors[bestIdx];
}