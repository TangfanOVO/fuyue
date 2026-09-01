import { Check, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type AvatarCropperProps = {
  file: File;
  title: string;
  onCancel: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function AvatarCropper({ file, title, onCancel, onConfirm }: AvatarCropperProps) {
  const [source, setSource] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(0);
  const [vertical, setVertical] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function confirm() {
    if (!source || !size.width || !size.height || busy) return;
    setBusy(true);
    try {
      const image = new Image();
      image.src = source;
      await image.decode();
      const cropSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
      const horizontalRoom = Math.max(0, (image.naturalWidth - cropSize) / 2);
      const verticalRoom = Math.max(0, (image.naturalHeight - cropSize) / 2);
      const sourceX = clamp(image.naturalWidth / 2 + (horizontal / 100) * horizontalRoom - cropSize / 2, 0, image.naturalWidth - cropSize);
      const sourceY = clamp(image.naturalHeight / 2 + (vertical / 100) * verticalRoom - cropSize / 2, 0, image.naturalHeight - cropSize);
      const canvas = document.createElement("canvas");
      canvas.width = 768;
      canvas.height = 768;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("浏览器没有提供图片裁剪画布");
      context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("头像裁剪失败")), "image/jpeg", 0.9));
      const name = `${file.name.replace(/\.[^.]+$/, "") || "avatar"}-cropped.jpg`;
      await onConfirm(new File([blob], name, { type: blob.type, lastModified: Date.now() }));
    } finally {
      setBusy(false);
    }
  }

  return <div className="cropper-backdrop" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
    <section className="avatar-cropper">
      <header><div><small>上传前预览</small><h2 id="avatar-crop-title">{title}</h2></div><button type="button" onClick={onCancel} aria-label="取消裁剪"><X /></button></header>
      <div className="avatar-crop-viewport">
        {source && <img src={source} alt="待裁剪头像" onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} style={{ objectPosition: `${50 + horizontal / 2}% ${50 + vertical / 2}%`, transform: `scale(${zoom})` }} />}
        <span aria-hidden="true" />
      </div>
      <div className="avatar-crop-controls">
        <label>缩放<input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <label>左右<input type="range" min="-100" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))} /></label>
        <label>上下<input type="range" min="-100" max="100" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} /></label>
      </div>
      <footer><button type="button" className="secondary-button" onClick={onCancel}>重新选择</button><button type="button" className="primary-button" disabled={busy || !size.width} onClick={() => void confirm()}><Check />{busy ? "正在裁剪" : "使用这张头像"}</button></footer>
    </section>
  </div>;
}
