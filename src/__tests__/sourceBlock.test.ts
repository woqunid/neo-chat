import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSourceBlockPresentation } from "../lib/search/sourceBlock";

const sourceBlockSource = readFileSync(
  new URL("../components/content/SourceBlock.tsx", import.meta.url),
  "utf8",
);
const toolCallBlockSource = readFileSync(
  new URL("../components/content/ToolCallBlock.tsx", import.meta.url),
  "utf8",
);

describe("source block presentation", () => {
  it("renders safe image-only result blocks", () => {
    expect(
      getSourceBlockPresentation({
        sourceCount: 0,
        imageCount: 3,
      }),
    ).toMatchObject({
      shouldRender: true,
      hasSources: false,
      hasImages: true,
      label: "Images",
      remainingImagesCount: 0,
    });
  });

  it("hides empty non-searching result blocks", () => {
    expect(
      getSourceBlockPresentation({
        sourceCount: 0,
        imageCount: 0,
      }),
    ).toMatchObject({
      shouldRender: false,
      label: "Sources",
    });
  });

  it("labels mixed source/image blocks and counts remaining images", () => {
    expect(
      getSourceBlockPresentation({
        sourceCount: 2,
        imageCount: 7,
        visibleImagesCount: 4,
      }),
    ).toMatchObject({
      shouldRender: true,
      hasSources: true,
      hasImages: true,
      label: "Sources & Images",
      remainingImagesCount: 3,
    });
  });

  it("renders searching blocks even before results arrive", () => {
    expect(
      getSourceBlockPresentation({
        sourceCount: 0,
        imageCount: 0,
        isSearching: true,
      }),
    ).toMatchObject({
      shouldRender: true,
      label: "Searching...",
    });
  });

  it("keeps failed search and tool details collapsed by default", () => {
    expect(sourceBlockSource).toContain(
      "const [isExpanded, setIsExpanded] = useState(false);",
    );
    expect(sourceBlockSource).toContain("{isExpanded && !isSearching && (");
    expect(sourceBlockSource).not.toContain("isExpanded || error");
    expect(toolCallBlockSource).toContain(
      "const [isExpanded, setIsExpanded] = useState(false);",
    );
  });
});
