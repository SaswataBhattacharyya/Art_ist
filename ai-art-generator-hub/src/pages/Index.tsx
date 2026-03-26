import { useState } from "react";
import { Send, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import FileUpload from "@/components/FileUpload";
import { buildPayload, validateVideoFormat } from "@/lib/payload";

const API_ENDPOINT = "/api/generate"; // Change to your backend URL

const Index = () => {
  const [textPrompt, setTextPrompt] = useState("");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [styleImage, setStyleImage] = useState<File | null>(null);
  const [referenceVideo, setReferenceVideo] = useState<File | null>(null);
  const [styleVideo, setStyleVideo] = useState<File | null>(null);
  const [refVideoDesc, setRefVideoDesc] = useState("");
  const [styleVideoDesc, setStyleVideoDesc] = useState("");
  const [fps, setFps] = useState("");
  const [videoDuration, setVideoDuration] = useState("");
  const [cameraAngle, setCameraAngle] = useState("");
  const [lightingAngle, setLightingAngle] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastPayload, setLastPayload] = useState<string | null>(null);

  const handleVideoFile = (file: File | null, setter: (f: File | null) => void) => {
    if (file && !validateVideoFormat(file)) {
      toast.error("Please upload MP4 or WebM video files only.");
      return;
    }
    setter(file);
  };

  const handleImageFile = (file: File | null, setter: (f: File | null) => void) => {
    if (file && !["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      toast.error("Please upload JPG, JPEG, or PNG images only.");
      return;
    }
    setter(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textPrompt.trim()) {
      toast.error("Text prompt is required.");
      return;
    }

    setSubmitting(true);
    try {
      const fd = await buildPayload(
        {
          text_prompt: textPrompt.trim(),
          reference_video_description: refVideoDesc.trim() || null,
          style_video_description: styleVideoDesc.trim() || null,
          fps: fps ? Number(fps) : null,
          video_duration: videoDuration ? Number(videoDuration) : null,
          camera_angle: cameraAngle.trim() || null,
          lighting_angle: lightingAngle.trim() || null,
        },
        { referenceImage, styleImage, referenceVideo, styleVideo }
      );

      // Show the JSON payload for preview
      const meta = fd.get("metadata") as string;
      setLastPayload(meta);

      // Send to backend
      try {
        const res = await fetch(API_ENDPOINT, { method: "POST", body: fd });
        if (!res.ok) throw new Error(`Server error ${res.status}`);
        const data = await res.json().catch(() => null);
        toast.info(data?.message || "Backend is running in placeholder mode.");
      } catch {
        toast.info("Payload ready — connect your backend API to send it.");
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            AI Generation Studio
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Text Prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Text Prompt <span className="text-destructive">*</span>
            </label>
            <textarea
              value={textPrompt}
              onChange={(e) => setTextPrompt(e.target.value)}
              placeholder="Describe what you want to generate..."
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-secondary p-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring glow-border transition-shadow"
            />
          </div>

          {/* Image Uploads */}
          <div className="grid gap-6 sm:grid-cols-2">
            <FileUpload
              label="Reference Image"
              accept=".jpg,.jpeg,.png"
              file={referenceImage}
              onFileChange={(f) => handleImageFile(f, setReferenceImage)}
              type="image"
              description="JPG, JPEG, or PNG → converted to PNG"
            />
            <FileUpload
              label="Style Image"
              accept=".jpg,.jpeg,.png"
              file={styleImage}
              onFileChange={(f) => handleImageFile(f, setStyleImage)}
              type="image"
              description="JPG, JPEG, or PNG → converted to PNG"
            />
          </div>

          {/* Video Uploads */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-4">
              <FileUpload
                label="Reference Video"
                accept=".mp4,.webm"
                file={referenceVideo}
                onFileChange={(f) => handleVideoFile(f, setReferenceVideo)}
                type="video"
                description="MP4 or WebM"
              />
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Reference Video Explanation
                </label>
                <textarea
                  value={refVideoDesc}
                  onChange={(e) => setRefVideoDesc(e.target.value)}
                  placeholder="Explain what you're uploading or what kind of reference video you want..."
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="space-y-4">
              <FileUpload
                label="Style Video"
                accept=".mp4,.webm"
                file={styleVideo}
                onFileChange={(f) => handleVideoFile(f, setStyleVideo)}
                type="video"
                description="MP4 or WebM"
              />
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Style Video Explanation
                </label>
                <textarea
                  value={styleVideoDesc}
                  onChange={(e) => setStyleVideoDesc(e.target.value)}
                  placeholder="Explain what you're uploading or what kind of style video you want..."
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Advanced Settings
          </button>

          {showAdvanced && (
            <div className="grid gap-6 sm:grid-cols-2 rounded-lg border border-border bg-card p-6 glow-border">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">FPS</label>
                <input
                  type="number"
                  value={fps}
                  onChange={(e) => setFps(e.target.value)}
                  placeholder="e.g. 24"
                  min={1}
                  max={120}
                  className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Video Duration (sec)</label>
                <input
                  type="number"
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(e.target.value)}
                  placeholder="e.g. 10"
                  min={1}
                  className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Camera Angle</label>
                <input
                  type="text"
                  value={cameraAngle}
                  onChange={(e) => setCameraAngle(e.target.value)}
                  placeholder="e.g. Low angle, eye level..."
                  className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Lighting Angle</label>
                <input
                  type="text"
                  value={lightingAngle}
                  onChange={(e) => setLightingAngle(e.target.value)}
                  placeholder="e.g. Backlit, soft diffused..."
                  className="w-full rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || !textPrompt.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="animate-pulse">Processing...</span>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Generate
              </>
            )}
          </button>
        </form>

        {/* JSON Preview */}
        {lastPayload && (
          <div className="mt-10 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">JSON Payload Preview</h2>
            <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 text-xs text-secondary-foreground font-mono glow-border">
              {lastPayload}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
