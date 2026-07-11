"use client";

import { ChevronDown } from "lucide-react";
import { AdminTextField } from "./AdminFormControls";

interface GrokModelFieldProps {
  value: string;
  models: readonly string[];
  onChange: (value: string) => void;
}

export function getSelectableGrokModels(
  models: readonly string[],
  currentModel: string,
): string[] {
  const detectedModels = [
    ...new Set(models.map((model) => model.trim()).filter(Boolean)),
  ];
  if (detectedModels.length === 0) return [];

  const selectedModel = currentModel.trim();
  if (!selectedModel || detectedModels.includes(selectedModel)) {
    return detectedModels;
  }
  return [selectedModel, ...detectedModels];
}

export default function GrokModelField({
  value,
  models,
  onChange,
}: GrokModelFieldProps) {
  const options = getSelectableGrokModels(models, value);
  if (options.length === 0) {
    return (
      <AdminTextField
        label="模型"
        value={value}
        placeholder="grok-4"
        monospace
        onChange={onChange}
      />
    );
  }

  const selectedValue = value.trim();
  return (
    <label className="block space-y-2 text-sm font-medium">
      模型
      <span className="relative block">
        <select
          aria-label="模型"
          value={selectedValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 font-mono text-xs outline-none transition-shadow focus:ring-2 focus:ring-ring"
        >
          {!selectedValue ? (
            <option value="" disabled>
              请选择模型
            </option>
          ) : null}
          {options.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    </label>
  );
}
