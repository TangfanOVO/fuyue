import type { NativeLiveCallEvent } from "./native-gateway";

export interface BrowserLiveCallController {
  setMuted(muted: boolean): void;
  cancelResponse(): void;
  speakText(text: string): void;
  stop(): Promise<void>;
}

type LiveSession = {
  socket: WebSocket;
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
  silent: GainNode;
  sources: Set<AudioBufferSourceNode>;
  playAt: number;
  byteCarry: number | null;
  muted: boolean;
  stopped: boolean;
  bargeAt: number;
  bargePending: boolean;
  discardAudio: boolean;
  awaitingNewPlayback: boolean;
};

function websocketUrl(relayUrl: string): string {
  const url = new URL(relayUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/v1/voice/live`;
  url.search = ""; url.hash = "";
  return url.toString();
}

function pcm16Base64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) value += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(value);
}

function downsample(input: Float32Array, inputRate: number): Int16Array {
  const ratio = inputRate / 16_000; const length = Math.max(1, Math.round(input.length / ratio)); const result = new Int16Array(length);
  for (let output = 0; output < length; output += 1) {
    const start = Math.round(output * ratio); const end = Math.min(input.length, Math.round((output + 1) * ratio)); let sum = 0; let count = 0;
    for (let index = start; index < end; index += 1) { sum += input[index] || 0; count += 1; }
    result[output] = Math.max(-1, Math.min(1, count ? sum / count : 0)) * 0x7fff;
  }
  return result;
}

async function captureNode(context: AudioContext, onFrame: (frame: Float32Array) => void): Promise<AudioWorkletNode> {
  if (!context.audioWorklet || typeof AudioWorkletNode === "undefined") throw new Error("这个浏览器没有 AudioWorklet，请使用轮流语音");
  await context.audioWorklet.addModule("/fuyue-pcm-capture.js");
  const node = new AudioWorkletNode(context, "fuyue-pcm-capture", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { frameSize: 2048 } });
  node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => onFrame(new Float32Array(event.data));
  return node;
}

function stopPlayback(session: LiveSession): void {
  session.sources.forEach((source) => { try { source.stop(); } catch {} });
  session.sources.clear(); session.playAt = 0; session.byteCarry = null;
}

function playPcm(session: LiveSession, encoded: string): void {
  let binary = ""; try { binary = atob(encoded); } catch { return; }
  const bytes = new Uint8Array(binary.length + (session.byteCarry === null ? 0 : 1)); let offset = 0;
  if (session.byteCarry !== null) { bytes[0] = session.byteCarry; offset = 1; }
  for (let index = 0; index < binary.length; index += 1) bytes[offset + index] = binary.charCodeAt(index);
  const complete = bytes.length - (bytes.length % 2); session.byteCarry = complete < bytes.length ? (bytes[bytes.length - 1] ?? null) : null;
  if (!complete) return;
  const buffer = session.context.createBuffer(1, complete / 2, 24_000); const channel = buffer.getChannelData(0); const view = new DataView(bytes.buffer, bytes.byteOffset, complete);
  for (let index = 0; index < channel.length; index += 1) channel[index] = view.getInt16(index * 2, true) / 0x8000;
  const source = session.context.createBufferSource(); source.buffer = buffer; source.connect(session.context.destination);
  const now = session.context.currentTime; if (session.playAt < now + 0.02) session.playAt = now + 0.02;
  source.start(session.playAt); session.playAt += buffer.duration; session.sources.add(source); source.onended = () => session.sources.delete(source);
}

export async function startBrowserLiveCall({ relayUrl, instructions, onEvent }: {
  relayUrl: string; instructions: string; onEvent: (event: NativeLiveCallEvent) => void;
}): Promise<BrowserLiveCallController> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("这个浏览器没有实时麦克风能力");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const context = new AudioContext(); await context.resume();
  const socket = new WebSocket(websocketUrl(relayUrl));
  const source = context.createMediaStreamSource(stream); const silent = context.createGain(); silent.gain.value = 0;
  const session: LiveSession = { socket, context, stream, source, processor: null as unknown as AudioWorkletNode, silent, sources: new Set(), playAt: 0, byteCarry: null, muted: false, stopped: false, bargeAt: 0, bargePending: false, discardAudio: false, awaitingNewPlayback: false };
  const cancelForBarge = () => {
    if (session.bargePending) return; session.bargePending = true; session.discardAudio = true; session.awaitingNewPlayback = false; stopPlayback(session);
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "response.cancel" }));
    onEvent({ eventType: "turn_canceled", message: "已在浏览器端听到插话并停止上一段播报" });
  };
  const processor = await captureNode(context, (frame) => {
    if (session.stopped || session.muted || socket.readyState !== WebSocket.OPEN) return;
    const samples = downsample(frame, context.sampleRate); socket.send(JSON.stringify({ type: "input_audio_buffer.append", audio: pcm16Base64(samples) }));
    if (!session.sources.size) { session.bargeAt = 0; return; }
    let power = 0; for (let index = 0; index < samples.length; index += 1) power += samples[index]! * samples[index]!;
    const level = Math.sqrt(power / Math.max(1, samples.length)) / 0x7fff;
    if (level > 0.16) { const now = performance.now(); if (!session.bargeAt) session.bargeAt = now; else if (now - session.bargeAt >= 200) { session.bargeAt = 0; cancelForBarge(); } }
    else session.bargeAt = 0;
  });
  session.processor = processor; source.connect(processor); processor.connect(silent); silent.connect(context.destination);
  const release = async (sendClose: boolean) => {
    if (session.stopped) return; session.stopped = true; stopPlayback(session);
    if (sendClose && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "session.close" }));
    try { socket.close(); } catch {} processor.port.onmessage = null; processor.disconnect(); source.disconnect(); silent.disconnect();
    stream.getTracks().forEach((track) => track.stop()); await context.close().catch(() => undefined);
  };

  const ready = new Promise<void>((resolve, reject) => {
    let settled = false; const timer = window.setTimeout(() => { if (!settled) { settled = true; reject(new Error("relay 全双工电话连接超时")); } }, 8_000);
    socket.onopen = () => socket.send(JSON.stringify({ type: "start", instructions }));
    socket.onmessage = (event) => {
      let message: Record<string, unknown>; try { message = JSON.parse(String(event.data)) as Record<string, unknown>; } catch { return; }
      const type = String(message.type || ""); const text = String(message.delta || message.transcript || message.text || "");
      if (type === "session.created") { if (!settled) { settled = true; window.clearTimeout(timer); resolve(); } onEvent({ eventType: "connected", providerLabel: "豆包 Seeduplex · relay", model: String((message.session as { model?: unknown } | undefined)?.model || "1.2.6.1") }); }
      else if (type === "conversation.item.input_audio_transcription.started") { if (session.sources.size) cancelForBarge(); onEvent({ eventType: "transcription_started" }); }
      else if (type === "conversation.item.input_audio_transcription.delta") onEvent({ eventType: "transcript_delta", text });
      else if (type === "conversation.item.input_audio_transcription.completed") {
        // The realtime provider is only the ear and mouth. Stop its automatic
        // answer before handing the transcript to Fuyue's actual chat brain.
        session.bargePending = true;
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "response.cancel" }));
        onEvent({ eventType: "transcript_completed", text });
      }
      else if (type === "conversation.item.input_audio_transcription.failed") onEvent({ eventType: "turn_error", message: "豆包这轮没有完成实时识别，可以直接重说" });
      else if (type === "response.output_text.delta") onEvent({ eventType: "reply_delta", text });
      else if (type === "response.output_text.done") onEvent({ eventType: "reply_completed", text });
      else if (type === "response.output_audio.started") { if (session.awaitingNewPlayback) { session.discardAudio = false; session.awaitingNewPlayback = false; } onEvent({ eventType: "audio_started" }); }
      else if (type === "response.output_audio.delta") { const encoded = String(message.delta || message.audio || ""); if (encoded && !session.discardAudio) playPcm(session, encoded); }
      else if (type === "response.output_audio.done") onEvent({ eventType: "audio_completed" });
      else if (type === "response.done") onEvent({ eventType: "turn_completed" });
      else if (type === "response.canceled") { stopPlayback(session); if (!session.bargePending) onEvent({ eventType: "turn_canceled" }); session.bargePending = false; }
      else if (type === "error") onEvent({ eventType: "error", message: String(message.message || "全双工电话中断") });
    };
    socket.onerror = () => { if (!settled) { settled = true; window.clearTimeout(timer); reject(new Error("连不到 relay 全双工电话")); } else onEvent({ eventType: "error", message: "relay 全双工电话连接中断" }); };
    socket.onclose = () => { if (!session.stopped) { onEvent({ eventType: "closed" }); void release(false); } };
  });
  try { await ready; }
  catch (cause) { await release(false); throw cause; }

  return {
    setMuted(value) { session.muted = value; stream.getAudioTracks().forEach((track) => { track.enabled = !value; }); },
    cancelResponse() { cancelForBarge(); },
    speakText(text) { const value = text.trim(); if (!value || value.length > 8_000 || socket.readyState !== WebSocket.OPEN) throw new Error("这轮文字没有送进实时声音"); session.bargePending = false; session.awaitingNewPlayback = true; socket.send(JSON.stringify({ type: "speech_text_buffer.commit", text: value })); },
    async stop() { await release(true); },
  };
}
