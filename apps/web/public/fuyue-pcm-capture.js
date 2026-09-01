class FuyuePcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.frameSize = Math.max(256, Math.min(8192, Number(options.processorOptions?.frameSize) || 2048));
    this.pending = new Float32Array(this.frameSize);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    let sourceOffset = 0;
    while (sourceOffset < input.length) {
      const count = Math.min(this.frameSize - this.offset, input.length - sourceOffset);
      this.pending.set(input.subarray(sourceOffset, sourceOffset + count), this.offset);
      this.offset += count;
      sourceOffset += count;
      if (this.offset === this.frameSize) {
        const frame = this.pending;
        this.port.postMessage(frame.buffer, [frame.buffer]);
        this.pending = new Float32Array(this.frameSize);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("fuyue-pcm-capture", FuyuePcmCaptureProcessor);
