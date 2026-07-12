"use client";

import { PluginMarketView } from "./market/PluginMarketView";
import { usePluginMarket } from "./market/usePluginMarket";

export interface PluginMarketProps {
  onClose: () => void;
}

export default function PluginMarket({ onClose }: PluginMarketProps) {
  const market = usePluginMarket();
  return <PluginMarketView market={market} onClose={onClose} />;
}
