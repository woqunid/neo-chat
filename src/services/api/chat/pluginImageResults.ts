type PluginImageCandidate = {
  data?: unknown;
  url?: unknown;
  mimeType?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parsePluginImageBase64(
  value: unknown,
  fallbackMimeType: unknown,
): { data: string; mimeType: string } | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const dataUrlMatch = raw.match(/^data:([^;,]+)?;base64,(.*)$/);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1] || "image/png",
      data: dataUrlMatch[2] || "",
    };
  }
  return {
    mimeType:
      typeof fallbackMimeType === "string" ? fallbackMimeType : "image/png",
    data: raw,
  };
}

function getPluginResultImageCandidates(
  resultData: unknown,
): PluginImageCandidate[] {
  if (!isRecord(resultData)) return [];
  const nested = Array.isArray(resultData.images)
    ? resultData.images.filter(isRecord)
    : [];
  const records = nested.length > 0 ? nested : [resultData];
  return records.flatMap((item) => {
    const base64 = parsePluginImageBase64(item.imageBase64, item.mimeType);
    const url =
      typeof item.imageUrl === "string" && item.imageUrl.trim()
        ? item.imageUrl.trim()
        : "";
    if (!base64 && !url) return [];
    return [
      {
        data: base64?.data,
        url: base64 ? undefined : url,
        mimeType: base64?.mimeType || item.mimeType,
      },
    ];
  });
}

export function getPluginResultImageAttachments(resultData: unknown) {
  return getPluginResultImageCandidates(resultData).map((image, index) => ({
    id: crypto.randomUUID(),
    mimeType: typeof image.mimeType === "string" ? image.mimeType : "image/png",
    fileName: `mcp-tool-image-${index + 1}.png`,
    ...(typeof image.data === "string" ? { data: image.data } : {}),
    ...(typeof image.url === "string" ? { url: image.url } : {}),
  }));
}

export function compactPluginImageResultForHistory(
  resultData: unknown,
): unknown {
  if (!isRecord(resultData)) return resultData;
  const images = getPluginResultImageCandidates(resultData);
  if (images.length === 0) return resultData;
  const compacted = Object.fromEntries(
    Object.entries(resultData).filter(
      ([key]) => !["imageBase64", "imageUrl", "images", "raw"].includes(key),
    ),
  );
  const firstUrl = images.find(
    (image) => typeof image.url === "string" && image.url.trim(),
  )?.url;
  const hasInline = images.some(
    (image) => typeof image.data === "string" && image.data.trim(),
  );
  return {
    ...compacted,
    imageUrl: typeof firstUrl === "string" ? firstUrl : null,
    imageBase64: hasInline ? "[image omitted]" : null,
    imageCount: images.length,
  };
}
