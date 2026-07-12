import { useEffect, useState } from "react";
import type { MarketSource } from "./types";

export function useMarketFilters() {
  const [source, setSource] = useState<MarketSource>("plugins");
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [mcpPageCursors, setMcpPageCursors] = useState([""]);
  const [mcpNextCursor, setMcpNextCursor] = useState("");
  useEffect(() => {
    setPage(1);
    if (source === "mcp") {
      setMcpPageCursors([""]);
      setMcpNextCursor("");
    }
  }, [search, categories, source]);
  const setActiveSource = (value: MarketSource) => {
    setSource(value);
    setCategories([]);
  };
  const toggleCategory = (value: string) =>
    setCategories((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  const previousPage = () => setPage((current) => Math.max(1, current - 1));
  const controller = {
    activeSource: source,
    setActiveSource,
    searchTerm: search,
    setSearchTerm: setSearch,
    selectedCategories: categories,
    setSelectedCategories: setCategories,
    toggleCategory,
    currentPage: page,
    previousPage,
  };
  return {
    source,
    search,
    categories,
    page,
    mcpPageCursors,
    mcpNextCursor,
    setMcpNextCursor,
    setPage,
    setMcpPageCursors,
    controller,
  };
}
