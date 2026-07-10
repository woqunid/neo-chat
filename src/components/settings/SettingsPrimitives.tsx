"use client";

import React from "react";

type OptionIcon = React.ComponentType<
  {
    readonly size?: number;
  } & Pick<React.SVGProps<SVGSVGElement>, "aria-hidden">
>;

interface SegmentedControlProps<T extends string> {
  readonly options: readonly {
    readonly value: T;
    readonly label: string;
    readonly icon?: OptionIcon;
  }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly ariaLabel?: string;
}

export function SegmentedControl<T extends string>(
  props: SegmentedControlProps<T>,
) {
  return (
    <div
      role="group"
      aria-label={props.ariaLabel}
      className="flex rounded-md bg-muted p-1 text-muted-foreground"
    >
      {props.options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={props.value === option.value}
          onClick={() => props.onChange(option.value)}
          className={`flex-1 flex items-center justify-center gap-2 rounded-sm px-2 py-2 text-sm font-medium transition-[color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            props.value === option.value
              ? "bg-background text-foreground shadow-sm"
              : "hover:text-foreground"
          }`}
        >
          {option.icon && <option.icon size={16} aria-hidden="true" />}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

interface SimpleSwitchProps {
  readonly checked: boolean;
  readonly onChange: () => void;
  readonly ariaLabel?: string;
  readonly id?: string;
  readonly name?: string;
}

export function SimpleSwitch(props: SimpleSwitchProps) {
  return (
    <label className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center">
      <input
        id={props.id}
        name={props.name}
        type="checkbox"
        aria-label={props.ariaLabel}
        className="sr-only peer"
        checked={props.checked}
        onChange={props.onChange}
      />
      <span
        data-state={props.checked ? "checked" : "unchecked"}
        className="h-5 w-9 rounded-full bg-input transition-[background-color,box-shadow] data-[state=checked]:bg-blue-500 data-[state=checked]:shadow-[0_0_0_3px_rgba(59,130,246,0.18)] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:border after:border-input after:bg-background after:shadow-sm after:transition-transform after:content-[''] data-[state=checked]:after:translate-x-full data-[state=checked]:after:border-background dark:data-[state=checked]:bg-blue-400"
      />
    </label>
  );
}
