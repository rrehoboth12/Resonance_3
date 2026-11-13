(function () {
  "use strict";

  class ResonanceVisualizer {
    constructor(canvas, audioElement, onUpdate) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.audio = audioElement;
      this.onUpdate = onUpdate;
      this.audioContext = null;
      this.analyser = null;
      this.source = null;
      this.data = new Uint8Array(128);
      this.demoTime = 0;
      this.colorTime = 0;
      this.palette = { hue: 252, secondary: 192, bass: 0, mids: 0, treble: 0 };
      this.resize = this.resize.bind(this);
      this.draw = this.draw.bind(this);
      window.addEventListener("resize", this.resize);
      this.resize();
      requestAnimationFrame(this.draw);
    }

    connect() {
      if (this.audioContext) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;
      this.source = this.audioContext.createMediaElementSource(this.audio);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    }

    resume() {
      this.connect();
      if (this.audioContext && this.audioContext.state === "suspended") this.audioContext.resume();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      this.canvas.width = Math.floor(rect.width * ratio);
      this.canvas.height = Math.floor(rect.height * ratio);
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.width = rect.width;
      this.height = rect.height;
    }

    average(start, end) {
      let total = 0;
      for (let index = start; index < end; index += 1) total += this.data[index] || 0;
      return total / Math.max(1, end - start) / 255;
    }

    readFrequencies() {
      this.colorTime += 0.0032;
      this.demoTime += 0.016;
      if (this.analyser && !this.audio.paused) {
        this.analyser.getByteFrequencyData(this.data);
      } else {
        // An idle signal keeps the visualizer alive before the first local track is imported.
        for (let index = 0; index < this.data.length; index += 1) {
          const wave = Math.sin(this.demoTime * 2.1 + index * 0.29) + Math.sin(this.demoTime * 0.7 + index * 0.11);
          const taper = Math.max(0.1, 1 - index / 170);
          this.data[index] = (22 + (wave + 2) * 13) * taper;
        }
      }

      /*
       * FFT MAPPING
       * With fftSize=256, the analyzer returns 128 bins from low to high frequency.
       * The low bins create the large beat pulse. Middle bins steer the palette.
       * Upper bins control the fine sparks and narrow bars. This keeps each visual
       * response tied to measured frequency energy instead of a random animation.
       */
      const bass = this.average(1, 12);
      const mids = this.average(12, 48);
      const treble = this.average(48, 105);
      // The slow hue orbit keeps the entire page visibly color-changing at rest.
      // During playback, FFT energy bends that orbit so each song alters the palette.
      const hueOrbit = (this.colorTime * 360) % 360;
      const hueTarget = (hueOrbit + mids * 92 + treble * 46 + bass * 24) % 360;

      this.palette.bass += (bass - this.palette.bass) * 0.24;
      this.palette.mids += (mids - this.palette.mids) * 0.14;
      this.palette.treble += (treble - this.palette.treble) * 0.18;
      const hueDistance = ((hueTarget - this.palette.hue + 540) % 360) - 180;
      this.palette.hue = (this.palette.hue + hueDistance * 0.035 + 360) % 360;
      this.palette.secondary = (this.palette.hue + 77 + bass * 35) % 360;
      return this.palette;
    }

    drawGlow(x, y, radius, color) {
      const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, "transparent");
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }

    drawWaveform(signal, baseline, amplitude, hue, alpha) {
      const { width, ctx } = this;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 5) {
        const ratio = x / width;
        const bin = Math.min(this.data.length - 1, Math.floor(ratio * this.data.length));
        const energy = this.data[bin] / 255;
        const wave = Math.sin(ratio * 17 + this.demoTime * 2.4) * amplitude * (0.24 + energy);
        const fine = Math.sin(ratio * 43 - this.demoTime * 1.7) * amplitude * signal.treble * .32;
        const y = baseline + wave + fine;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `hsla(${hue}, 96%, 70%, ${alpha})`;
      ctx.stroke();
    }

    drawRadialSpectrum(signal, centerX, centerY, radius) {
      const { ctx } = this;
      const spokes = 82;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(this.demoTime * .08);
      for (let index = 0; index < spokes; index += 1) {
        const angle = index / spokes * Math.PI * 2;
        const value = this.data[Math.floor(index / spokes * this.data.length)] / 255;
        const inner = radius + 6;
        const outer = inner + 10 + value * (74 + signal.bass * 38);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.lineWidth = index % 3 === 0 ? 1.8 : .75;
        ctx.strokeStyle = `hsla(${(signal.hue + index * 1.7) % 360}, 92%, 70%, ${.2 + value * .68})`;
        ctx.stroke();
      }
      ctx.restore();
    }

    drawOrbit(centerX, centerY, radius, signal) {
      const { ctx } = this;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(-this.demoTime * .16);
      ctx.setLineDash([2, 8]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = `hsla(${signal.secondary}, 100%, 76%, .28)`;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.65, radius * .72, -.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const satelliteX = Math.cos(this.demoTime * .62) * radius * 1.54;
      const satelliteY = Math.sin(this.demoTime * .62) * radius * .66;
      ctx.fillStyle = `hsl(${signal.secondary}, 100%, 72%)`;
      ctx.beginPath();
      ctx.arc(satelliteX, satelliteY, 3 + signal.treble * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawParticles(signal) {
      const { width, height, ctx } = this;
      for (let index = 0; index < 34; index += 1) {
        const x = (index * 83.7 + this.demoTime * (9 + index % 5)) % width;
        const y = (index * 47.3 + Math.sin(this.demoTime + index) * 29 + height) % height;
        const size = .7 + (index % 4) * .38 + signal.treble * 1.4;
        ctx.fillStyle = `hsla(${(signal.secondary + index * 4) % 360}, 100%, 77%, ${.18 + signal.treble * .45})`;
        ctx.fillRect(x, y, size, size);
      }
    }

    draw() {
      const { width, height, ctx } = this;
      const signal = this.readFrequencies();
      const bassPulse = 1 + signal.bass * 0.48;
      const centerX = width * .7;
      const centerY = height * .48;
      const coreRadius = 44 + signal.bass * 38;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = `hsl(${signal.hue}, 42%, 6%)`;
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = "screen";
      this.drawGlow(width * .18, height * .62, 250 * bassPulse, `hsla(${signal.secondary}, 88%, 48%, ${.12 + signal.bass * .2})`);
      this.drawGlow(centerX, centerY, 245 * bassPulse, `hsla(${signal.hue}, 90%, 54%, ${.14 + signal.mids * .25})`);
      this.drawGlow(width * .93, height * .08, 170, `hsla(${(signal.hue + 145) % 360}, 94%, 55%, ${.09 + signal.treble * .15})`);
      this.drawParticles(signal);
      this.drawWaveform(signal, height * .38, 28 + signal.mids * 38, signal.secondary, .44);
      this.drawWaveform(signal, height * .66, 21 + signal.treble * 31, signal.hue, .3);
      this.drawRadialSpectrum(signal, centerX, centerY, coreRadius + 12);
      this.drawOrbit(centerX, centerY, coreRadius + 46, signal);

      const core = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, coreRadius);
      core.addColorStop(0, `hsla(${signal.secondary}, 100%, 79%, ${.75 + signal.bass * .2})`);
      core.addColorStop(.18, `hsla(${signal.hue}, 100%, 61%, .74)`);
      core.addColorStop(1, `hsla(${signal.hue}, 100%, 42%, .04)`);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.lineWidth = 1;
      ctx.strokeStyle = `hsla(${signal.secondary}, 100%, 82%, ${.3 + signal.bass * .5})`;
      ctx.beginPath();
      ctx.arc(centerX, centerY, coreRadius + 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";

      if (this.onUpdate) this.onUpdate(signal);
      requestAnimationFrame(this.draw);
    }
  }

  window.ResonanceVisualizer = ResonanceVisualizer;
})();
