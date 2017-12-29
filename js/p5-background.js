var quantity = 300;
var xPosition = [];
var yPosition = [];
var flakeSize = [];
var direction = [];
var minFlakeSize = 1;
var maxFlakeSize = 5;
var snowColor = 255;

function setup() {
  let height = (windowWidth > 425) ? windowHeight + 300 : windowHeight;
  let canvas = createCanvas(window.innerWidth, height);
  canvas.parent('background');
  background(0);

  // Creating Flakes
  frameRate(30);
  noStroke();

  for(var i = 0; i < quantity; i++) {
    flakeSize[i] = round(random(minFlakeSize, maxFlakeSize));
    xPosition[i] = random(0, width);
    yPosition[i] = random(0, height);
    direction[i] = round(random(0, 1));
  }
}

function draw() {
  // stroke(random(lineColors));
  // if (random(1) < 0.5) {
  //   line(x, y, x + spacing, y + spacing);
  // } else {
  //   line(x, y + spacing, x + spacing, y);
  // }
  // x += spacing;
  // if (x > width) {
  //   x = 0;
  //   y += spacing;
  // }

  background(0);
  fill(snowColor);
  rect(0,height*(4/5),width,height/5);
  drawSnow();
}

function drawSnow() {
	for(var i = 0; i < xPosition.length; i++) {

    ellipse(xPosition[i], yPosition[i], flakeSize[i], flakeSize[i]);

    if(direction[i] == 0) {
      xPosition[i] += map(flakeSize[i], minFlakeSize, maxFlakeSize, .1, .5);
    } else {
      xPosition[i] -= map(flakeSize[i], minFlakeSize, maxFlakeSize, .1, .5);
    }

    yPosition[i] += flakeSize[i] + direction[i];

    if(xPosition[i] > width + flakeSize[i] || xPosition[i] < -flakeSize[i] || yPosition[i] > height + flakeSize[i]) {
      xPosition[i] = random(0, width);
      yPosition[i] = -flakeSize[i];
    }
  }
}
