class Flake {
	constructor() {
		this.reset();
	}
	reset() {
		this.x = 0;
		this._x = Math.random() * width;
		this.y = -5;
		this.z = Math.random() * 0.8 + 0.2;
		this.o = Math.random() * Math.PI;
	}
	update() {
		this.x = Math.cos(this.o + this.y * (1 - this.z) * 0.05) * this.z * 20 + this._x;
		this.y += this.z * 8;
		if(this.y > height + 5) {
			this.reset();
		}
		return this;
	}
	draw() {
		let r = this.z * 1.5 + 0.5;
		canvas.moveTo(this.x + r, this.y);
		canvas.arc(this.x, this.y, r, 0, TAU);
	}
}
