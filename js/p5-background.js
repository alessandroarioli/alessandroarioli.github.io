let x = 0;
let y = 0;
let spacing = 45;
let lineColors = ['chartreuse', 'red', 'cyan', 'white', 'yellow', 'palegoldenrod', 'ivory', 'khaki'];


function setup() {
  let canvas = createCanvas(window.innerWidth, window.innerHeight);
  canvas.parent('background');
  background(0);
}

function draw() {
  stroke(random(lineColors));
  if (random(1) < 0.5) {
    line(x, y, x + spacing, y + spacing);
  } else {
    line(x, y + spacing, x + spacing, y);
  }
  x += spacing;
  if (x > width) {
    x = 0;
    y += spacing;
  }
}
